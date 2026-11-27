import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());

import { resetFake, setupI18n } from "../journal/testSupport";
import CampusStories from "./CampusStories";

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  resetFake({
    circles: [
      { id: "ci-1", name: "Exam Stress Circle", slug: "exam", description: "", category: "academic", is_private: false },
      { id: "ci-2", name: "Hostel Life", slug: "hostel", description: "", category: "social", is_private: false },
    ],
    posts: [
      { id: "p-1", circle_id: "ci-1", author_id: "a", title: "Finals panic", content: "Anyone else feeling stuck?", is_anonymous: true, moderation_status: "approved", likes_count: 12, created_at: "2026-01-01T10:00:00Z" },
      { id: "p-2", circle_id: "ci-2", author_id: "b", title: "First Diwali away", content: "It was hard, a roommate helped.", is_anonymous: true, moderation_status: "approved", likes_count: 8, created_at: "2026-01-02T10:00:00Z" },
      { id: "p-3", circle_id: "ci-2", author_id: "c", title: "Not yet reviewed", content: "waiting", is_anonymous: true, moderation_status: "pending", likes_count: 0, created_at: "2026-01-03T10:00:00Z" },
    ],
    profiles: [{ id: "user-1", role: "student" }],
  });
});

describe("CampusStories (real approved posts)", () => {
  it("lists approved posts, labels the circle and shows no author identity", async () => {
    render(<CampusStories onSelectStory={vi.fn()} />);
    expect(await screen.findByText("Finals panic")).toBeInTheDocument();
    expect(screen.getByText("First Diwali away")).toBeInTheDocument();
    expect(screen.queryByText("Not yet reviewed")).not.toBeInTheDocument();
    expect(screen.getAllByText("Hostel Life").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/user-1|"author_id"/);
  });

  it("filters by circle category and triggers onSelectStory", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CampusStories onSelectStory={onSelect} />);
    await screen.findByText("Finals panic");
    await user.click(screen.getByRole("button", { name: "social" }));
    expect(screen.queryByText("Finals panic")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Read story: First Diwali away" }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "p-2" }));
    const dialog = screen.getByRole("dialog", { name: "First Diwali away" });
    expect(within(dialog).getByText("It was hard, a roommate helped.")).toBeInTheDocument();
  });

  it("offers no like button because a like cannot be saved", async () => {
    render(<CampusStories onSelectStory={vi.fn()} />);
    await screen.findByText("Finals panic");
    expect(screen.queryAllByRole("button", { name: /Mark story helpful/i })).toHaveLength(0);
  });
});
