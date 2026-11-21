import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());
vi.mock("../doctors/http", () => ({ callFunction: vi.fn() }));
vi.mock("../../api", () => ({
  wellnessApi: {
    getStories: vi.fn(async () => [
      { id: "s1", title: "Surviving finals", campus: "DU", theme: "Exams & Burnout", author: "Anon", excerpt: "A short excerpt", fullText: "Full text", likes: 3, readTime: "3 min" },
      { id: "s2", title: "Far from home", campus: "IITB", theme: "Homesickness", author: "Anon", excerpt: "Another excerpt", fullText: "More text", likes: 1, readTime: "2 min" },
    ]),
    likeStory: vi.fn(async () => []),
  },
}));

import { fake, fakeSupabase, resetFake, setupI18n } from "../journal/testSupport";
import { callFunction } from "../doctors/http";
import { ApiError } from "../../shared/lib/api/errors";
import CirclesPanel from "./CirclesPanel";
import ModeratorQueue from "./ModeratorQueue";
import CampusStories from "../stories/CampusStories";
import StoryDetailModal from "../modals/StoryDetailModal";
import { submitPost } from "./api";

const mockCall = vi.mocked(callFunction);

function seed(role = "student") {
  resetFake({
    circles: [
      { id: "ci-1", name: "Exam Stress Circle", slug: "exam", description: "For exam anxiety", category: "academic", is_private: false },
      { id: "ci-2", name: "Hostel Life", slug: "hostel", description: "Homesickness", category: "social", is_private: false },
    ],
    circle_members: [{ id: "m-1", circle_id: "ci-1", user_id: "user-1" }],
    posts: [
      { id: "p-1", circle_id: "ci-1", author_id: "someone-else", title: "Finals panic", content: "Anyone else feeling stuck?", is_anonymous: true, moderation_status: "approved", likes_count: 2, created_at: "2026-01-01T10:00:00Z" },
      { id: "p-2", circle_id: "ci-1", author_id: "someone-else", title: "Hidden pending", content: "pending text", is_anonymous: true, moderation_status: "flagged", likes_count: 0, created_at: "2026-01-02T10:00:00Z", ai_moderation: { reasons: ["pii"] } },
    ],
    profiles: [{ id: "user-1", role }],
    reports: [{ id: "r-1", reporter_id: "other", resource_type: "post", resource_id: "p-1", reason: "harassment", details: "", moderation_status: "pending", created_at: "2026-01-03T10:00:00Z" }],
  });
}

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  seed();
  mockCall.mockReset();
});

async function openCircle(user: ReturnType<typeof userEvent.setup>, name = "Exam Stress Circle") {
  render(<CirclesPanel />);
  await user.click(await screen.findByRole("button", { name: `Open ${name}` }));
}

describe("Campus Circles", () => {
  it("lists circles and shows only approved posts without author identity", async () => {
    const user = userEvent.setup();
    await openCircle(user);
    expect(await screen.findByText("Finals panic")).toBeInTheDocument();
    expect(screen.getByText("Anyone else feeling stuck?")).toBeInTheDocument();
    expect(screen.queryByText("Hidden pending")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Anonymous peer/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("someone-else");
  });

  it("joins and leaves a circle", async () => {
    const user = userEvent.setup();
    render(<CirclesPanel />);
    const list = await screen.findByRole("list", { name: "Circles" });
    const hostel = within(list).getByRole("heading", { name: "Hostel Life" }).closest("li") as HTMLElement;
    await user.click(within(hostel).getByRole("button", { name: "Join circle" }));
    await waitFor(() => expect(fake.tables.circle_members.some((m) => m.circle_id === "ci-2")).toBe(true));
    await user.click(within(hostel).getByRole("button", { name: "Leave circle" }));
    await waitFor(() => expect(fake.tables.circle_members.some((m) => m.circle_id === "ci-2")).toBe(false));
  });

  it("asks non-members to join before posting", async () => {
    const user = userEvent.setup();
    await openCircle(user, "Hostel Life");
    expect(await screen.findByText(/Join the circle to post/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
  });

  it("pre-moderates with POST /moderation/classify and then publishes via POST /circles/:id/posts", async () => {
    mockCall.mockResolvedValueOnce({ status: "approved", riskLevel: "low", flagged: false, reasons: [], containsPII: false });
    mockCall.mockResolvedValueOnce({ moderation_status: "approved" });
    const user = userEvent.setup();
    await openCircle(user);
    await user.type(await screen.findByLabelText("Title"), "Study group idea");
    await user.type(screen.getByLabelText("What would you like to share?"), "Would a weekly group help us?");
    await user.click(screen.getByRole("button", { name: "Check and post" }));

    expect(await screen.findByText("Your post is live.")).toBeInTheDocument();
    expect(mockCall).toHaveBeenNthCalledWith(1, "POST", "/moderation/classify", { title: "Study group idea", content: "Would a weekly group help us?", circleId: "ci-1" });
    expect(mockCall).toHaveBeenNthCalledWith(2, "POST", "/circles/ci-1/posts", { title: "Study group idea", content: "Would a weekly group help us?", isAnonymous: true });
  });

  it("publishes the PII-redacted text and says so", async () => {
    mockCall.mockResolvedValueOnce({ status: "approved", riskLevel: "low", containsPII: true, redactedContent: "Call me on [phone removed]" });
    mockCall.mockResolvedValueOnce({ moderation_status: "approved" });
    const user = userEvent.setup();
    await openCircle(user);
    await user.type(await screen.findByLabelText("Title"), "Contact");
    await user.type(screen.getByLabelText("What would you like to share?"), "Call me on 9876543210");
    await user.click(screen.getByRole("button", { name: "Check and post" }));
    expect(await screen.findByText(/Personal details were removed/)).toBeInTheDocument();
    expect(mockCall.mock.calls[1][2]).toMatchObject({ content: "Call me on [phone removed]" });
  });

  it("queues flagged posts for a moderator", async () => {
    mockCall.mockResolvedValueOnce({ status: "flagged", riskLevel: "medium", reasons: ["harsh language"] });
    mockCall.mockResolvedValueOnce({ moderation_status: "flagged" });
    const user = userEvent.setup();
    await openCircle(user);
    await user.type(await screen.findByLabelText("Title"), "Rant");
    await user.type(screen.getByLabelText("What would you like to share?"), "This professor is awful");
    await user.click(screen.getByRole("button", { name: "Check and post" }));
    expect(await screen.findByText(/waiting for a moderator/)).toBeInTheDocument();
  });

  it("does not publish rejected posts", async () => {
    mockCall.mockResolvedValueOnce({ status: "rejected", reasons: ["bullying"] });
    const user = userEvent.setup();
    await openCircle(user);
    await user.type(await screen.findByLabelText("Title"), "Mean");
    await user.type(screen.getByLabelText("What would you like to share?"), "You are all fools");
    await user.click(screen.getByRole("button", { name: "Check and post" }));
    expect(await screen.findByText(/cannot be published/)).toHaveTextContent("bullying");
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it("intercepts crisis content locally: no API call, no post, helplines shown, draft kept", async () => {
    const user = userEvent.setup();
    await openCircle(user);
    await user.type(await screen.findByLabelText("Title"), "Cannot go on");
    await user.type(screen.getByLabelText("What would you like to share?"), "I want to end my life");
    await user.click(screen.getByRole("button", { name: "Check and post" }));

    const card = await screen.findByTestId("community-crisis");
    expect(card).toHaveTextContent("14416");
    expect(card).toHaveTextContent("1800-599-0019");
    expect(card).toHaveTextContent("112");
    expect(mockCall).not.toHaveBeenCalled();
    expect(fake.tables.posts.some((p) => p.title === "Cannot go on")).toBe(false);
    expect(screen.getByLabelText("What would you like to share?")).toHaveValue("I want to end my life");
  });

  it("intercepts crisis content that only the server classifier catches", async () => {
    mockCall.mockResolvedValueOnce({ status: "flagged", riskLevel: "crisis", crisis: true });
    const user = userEvent.setup();
    await openCircle(user);
    await user.type(await screen.findByLabelText("Title"), "Tired");
    await user.type(screen.getByLabelText("What would you like to share?"), "Everyone would be better off without me around");
    await user.click(screen.getByRole("button", { name: "Check and post" }));
    expect(await screen.findByTestId("community-crisis")).toBeInTheDocument();
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the moderation service is unreachable", async () => {
    mockCall.mockRejectedValueOnce(new ApiError("down", 503, "NETWORK_ERROR"));
    const user = userEvent.setup();
    await openCircle(user);
    await user.type(await screen.findByLabelText("Title"), "Hello");
    await user.type(screen.getByLabelText("What would you like to share?"), "Hi everyone");
    await user.click(screen.getByRole("button", { name: "Check and post" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not published");
    expect(mockCall).toHaveBeenCalledTimes(1);
  });

  it("requires a title and text", async () => {
    const user = userEvent.setup();
    await openCircle(user);
    await user.click(await screen.findByRole("button", { name: "Check and post" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("add a title");
  });

  it("reports a post to moderators", async () => {
    const user = userEvent.setup();
    await openCircle(user);
    await user.click(await screen.findByRole("button", { name: "Report post Finals panic" }));
    await user.selectOptions(screen.getByLabelText("Reason"), "harassment");
    await user.type(screen.getByLabelText(/Anything else/), "Targeting someone");
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText(/A moderator will review/)).toBeInTheDocument();
    const mine = fake.tables.reports.find((r) => r.reporter_id === "user-1");
    expect(mine).toMatchObject({ resource_type: "post", resource_id: "p-1", reason: "harassment", details: "Targeting someone" });
  });

  it("opens and closes the safe-space norms dialog", async () => {
    const user = userEvent.setup();
    render(<CirclesPanel />);
    await user.click(await screen.findByRole("button", { name: "Community safe-space norms" }));
    expect(screen.getByRole("dialog", { name: "Campus Circle safe-space norms" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows an error with retry when circles cannot load", async () => {
    const spy = vi.spyOn(fakeSupabase, "from").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const user = userEvent.setup();
    render(<CirclesPanel />);
    expect(await screen.findByText(/could not load the circles/i)).toBeInTheDocument();
    spy.mockRestore();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Open Exam Stress Circle" })).toBeInTheDocument();
  });
});
describe("submitPost", () => {
  it("returns crisis for imminent wording without any network call", async () => {
    await expect(submitPost({ circleId: "ci-1", title: "t", content: "main apni jaan le lunga", isAnonymous: true })).resolves.toEqual({ kind: "crisis" });
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe("Moderator queue", () => {
  it("is blocked for students", async () => {
    render(<ModeratorQueue />);
    expect(await screen.findByRole("alert")).toHaveTextContent("only for moderators");
  });

  it("shows reported and flagged posts, and applies decisions", async () => {
    seed("moderator");
    const user = userEvent.setup();
    render(<ModeratorQueue />);
    const list = await screen.findByRole("list", { name: "Items awaiting review" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(document.body.textContent).not.toContain("someone-else");

    const reported = within(list).getByText("Reported").closest("li") as HTMLElement;
    await user.click(within(reported).getByRole("button", { name: "Remove post" }));
    await waitFor(() => expect(fake.tables.posts.find((p) => p.id === "p-1")?.moderation_status).toBe("rejected"));
    expect(fake.tables.reports.find((r) => r.id === "r-1")).toMatchObject({ moderation_status: "actioned", reviewed_by: "user-1", action_taken: "remove" });

    const flagged = within(await screen.findByRole("list", { name: "Items awaiting review" })).getByText("AI-flagged").closest("li") as HTMLElement;
    expect(within(flagged).queryByRole("button", { name: "Dismiss report" })).not.toBeInTheDocument();
    await user.click(within(flagged).getByRole("button", { name: "Approve post" }));
    await waitFor(() => expect(fake.tables.posts.find((p) => p.id === "p-2")?.moderation_status).toBe("approved"));
    expect(await screen.findByText("The queue is clear. Nothing needs review.")).toBeInTheDocument();
  });

  it("dismisses a report without changing the post", async () => {
    seed("moderator");
    fake.tables.posts = fake.tables.posts.filter((p) => p.id !== "p-2");
    const user = userEvent.setup();
    render(<ModeratorQueue />);
    await user.click(await screen.findByRole("button", { name: "Dismiss report" }));
    await waitFor(() => expect(fake.tables.reports[0].moderation_status).toBe("dismissed"));
    expect(fake.tables.posts.find((p) => p.id === "p-1")?.moderation_status).toBe("approved");
  });
});

describe("Stories hub", () => {
  it("filters stories, opens one, and hides the moderator tab from students", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CampusStories onSelectStory={onSelect} />);
    expect(await screen.findByRole("button", { name: "Read story: Surviving finals" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Moderator queue" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Homesickness" }));
    expect(screen.queryByText("Surviving finals")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Read story: Far from home" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "s2" }));
  });

  it("shows the moderator tab to moderators and the circles hub on demand", async () => {
    seed("moderator");
    const user = userEvent.setup();
    render(<CampusStories onSelectStory={() => undefined} />);
    await user.click(await screen.findByRole("tab", { name: "Moderator queue" }));
    expect(await screen.findByRole("list", { name: "Items awaiting review" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Campus Peer Circles" }));
    expect(await screen.findByRole("list", { name: "Circles" })).toBeInTheDocument();
  });

  it("renders the story dialog with a labelled close button", async () => {
    const onClose = vi.fn();
    const onLike = vi.fn();
    const user = userEvent.setup();
    render(
      <StoryDetailModal
        story={{ id: "s1", title: "Surviving finals", campus: "DU", theme: "Exams & Burnout", author: "Anon", excerpt: "e", fullText: "Full text body", likes: 3, readTime: "3 min" }}
        onClose={onClose}
        onLike={onLike}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Surviving finals" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Helpful (3)" }));
    expect(onLike).toHaveBeenCalledWith("s1");
    await user.click(screen.getByRole("button", { name: "Close story" }));
    expect(onClose).toHaveBeenCalled();
  });
});
