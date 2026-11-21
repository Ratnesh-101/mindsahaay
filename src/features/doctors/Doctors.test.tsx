import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../shared/lib/supabase", async () => (await import("../journal/testSupport")).supabaseModule());
vi.mock("./http", () => ({ callFunction: vi.fn() }));

import { fake, fakeSupabase, resetFake, setupI18n } from "../journal/testSupport";
import { callFunction } from "./http";
import Doctors from "./Doctors";
import VideoSessionModal from "../modals/VideoSessionModal";
import BookingConfirmationModal from "../modals/BookingConfirmationModal";
import { ApiError } from "../../shared/lib/api/errors";
import { buildDailyEmbedUrl, canCancel, cancelAppointment, toHostAppointment } from "./api";

const mockCall = vi.mocked(callFunction);

const inDays = (d: number, hour = 10) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  t.setHours(hour, 0, 0, 0);
  return t.toISOString();
};

function seed() {
  resetFake({
    counsellors: [
      { id: "c-1", verified: true, specializations: ["Anxiety", "Exam stress"], bio: "Works with exam anxiety.", institution_id: "i-1", profiles: { alias: "Dr. Ananya" } },
      { id: "c-2", verified: true, specializations: ["Sleep"], bio: "", institution_id: "i-1", profiles: { alias: "Dr. Kabir" } },
      { id: "c-3", verified: false, specializations: ["Hidden"], bio: "", institution_id: null, profiles: { alias: "Unverified" } },
    ],
    availability_slots: [
      { id: "s-1", counsellor_id: "c-1", start_time: inDays(2, 10), end_time: inDays(2, 11), is_booked: false },
      { id: "s-2", counsellor_id: "c-1", start_time: inDays(3, 15), end_time: inDays(3, 16), is_booked: false },
      { id: "s-3", counsellor_id: "c-1", start_time: inDays(4, 9), end_time: inDays(4, 10), is_booked: true },
      { id: "s-4", counsellor_id: "c-2", start_time: inDays(2, 12), end_time: inDays(2, 13), is_booked: false },
    ],
    appointments: [
      { id: "a-1", student_id: "user-1", counsellor_id: "c-1", slot_id: "s-x", scheduled_at: inDays(5, 10), status: "confirmed", meeting_url: "https://meet.example/1", notes: "" },
      { id: "a-2", student_id: "user-1", counsellor_id: "c-2", slot_id: "s-y", scheduled_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), status: "confirmed", meeting_url: "https://meet.example/2", notes: "" },
    ],
    notifications: [
      { id: "n-1", user_id: "user-1", title: "Session reminder", body: "Your session is tomorrow.", type: "appointment_reminder", read: false, created_at: new Date().toISOString() },
      { id: "n-2", user_id: "user-1", title: "Other", body: "ignore", type: "system", read: false, created_at: new Date().toISOString() },
    ],
  });
}

beforeAll(async () => {
  await setupI18n("en");
});

beforeEach(() => {
  seed();
  mockCall.mockReset();
});

describe("Doctors: directory and booking", () => {
  it("lists verified counsellors from the table with real, unbooked slots only", async () => {
    render(<Doctors studentId="user-1" onBookSuccess={() => undefined} />);
    const list = await screen.findByRole("list", { name: "Counsellors" });
    expect(within(list).getByText("Dr. Ananya")).toBeInTheDocument();
    expect(within(list).getByText("Dr. Kabir")).toBeInTheDocument();
    expect(within(list).queryByText("Unverified")).not.toBeInTheDocument();

    const slots = await screen.findByRole("group", { name: "Available slots" });
    expect(within(slots).getAllByRole("button")).toHaveLength(2);
  });

  it("books through POST /appointments and reports the booking to the host app", async () => {
    mockCall.mockResolvedValueOnce({ id: "a-new", counsellor_id: "c-1", slot_id: "s-1", scheduled_at: inDays(2, 10), status: "confirmed", meeting_url: "https://meet.example/new" });
    const onBook = vi.fn();
    const user = userEvent.setup();
    render(<Doctors studentId="user-1" onBookSuccess={onBook} />);

    const book = await screen.findByRole("button", { name: /Book appointment/ });
    expect(book).toBeDisabled();
    const slots = await screen.findByRole("group", { name: "Available slots" });
    await user.click((await within(slots).findAllByRole("button"))[0]);
    await user.type(screen.getByLabelText(/Note for your counsellor/), "Exam stress");
    expect(book).toBeEnabled();
    await user.click(book);

    await waitFor(() => expect(onBook).toHaveBeenCalledTimes(1));
    expect(mockCall).toHaveBeenCalledWith(
      "POST",
      "/appointments",
      expect.objectContaining({ counsellorId: "c-1", slotId: "s-1", notes: "Exam stress" }),
    );
    expect(onBook.mock.calls[0][0]).toMatchObject({ id: "a-new", doctorId: "c-1", doctorName: "Dr. Ananya", status: "confirmed" });
    expect(await screen.findByText("Appointment confirmed.")).toBeInTheDocument();
  });

  it("explains a 409 slot conflict and refreshes the slots", async () => {
    mockCall.mockRejectedValueOnce(new ApiError("Slot is already booked", 409, "CONFLICT"));
    const onBook = vi.fn();
    const user = userEvent.setup();
    render(<Doctors studentId="user-1" onBookSuccess={onBook} />);
    const slots = await screen.findByRole("group", { name: "Available slots" });
    await user.click((await within(slots).findAllByRole("button"))[0]);
    await user.click(screen.getByRole("button", { name: /Book appointment/ }));
    expect(await screen.findByText(/Someone just took that slot/)).toBeInTheDocument();
    expect(onBook).not.toHaveBeenCalled();
  });

  it("filters by specialisation", async () => {
    const user = userEvent.setup();
    render(<Doctors studentId="user-1" onBookSuccess={() => undefined} />);
    await screen.findByRole("list", { name: "Counsellors" });
    await user.selectOptions(screen.getByLabelText("Filter by specialisation"), "Sleep");
    const list = screen.getByRole("list", { name: "Counsellors" });
    expect(within(list).queryByText("Dr. Ananya")).not.toBeInTheDocument();
    expect(within(list).getByText("Dr. Kabir")).toBeInTheDocument();
  });

  it("shows upcoming appointments and appointment reminders only", async () => {
    render(<Doctors studentId="user-1" onBookSuccess={() => undefined} />);
    const appts = await screen.findByRole("heading", { name: "Your appointments" });
    const section = appts.closest("section") as HTMLElement;
    await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(2));
    expect(await screen.findByText("Session reminder")).toBeInTheDocument();
    expect(screen.queryByText("ignore")).not.toBeInTheDocument();
  });

  it("cancels an appointment more than 2 hours ahead and blocks late cancellation", async () => {
    const user = userEvent.setup();
    render(<Doctors studentId="user-1" onBookSuccess={() => undefined} />);
    const section = (await screen.findByRole("heading", { name: "Your appointments" })).closest("section") as HTMLElement;
    await waitFor(() => expect(within(section).getAllByRole("button", { name: "Cancel appointment" })).toHaveLength(2));
    const [far, soon] = within(section).getAllByRole("button", { name: "Cancel appointment" });
    // Appointments are ordered soonest first, so the 30 minute one is first.
    expect(far).toBeDisabled();
    expect(within(section).getByText(/up to 2 hours before/)).toBeInTheDocument();
    await user.click(soon);
    await user.click(screen.getByRole("button", { name: "Yes, cancel it" }));
    await waitFor(() => expect(fake.tables.appointments.find((a) => a.id === "a-1")?.status).toBe("cancelled"));
    expect(fake.tables.appointments.find((a) => a.id === "a-2")?.status).toBe("confirmed");
    expect(await screen.findByText("Appointment cancelled.")).toBeInTheDocument();
  });

  it("shows an error state with retry when the directory cannot load", async () => {
    const spy = vi.spyOn(fakeSupabase, "from").mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const user = userEvent.setup();
    render(<Doctors studentId="user-1" onBookSuccess={() => undefined} />);
    expect(await screen.findByText(/could not load the counsellor list/i)).toBeInTheDocument();
    spy.mockRestore();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Dr. Ananya" })).toBeInTheDocument();
  });
});

describe("booking helpers", () => {
  it("enforces the 2 hour cancellation rule", async () => {
    const now = new Date("2026-03-01T10:00:00Z");
    expect(canCancel("2026-03-01T12:00:01Z", now)).toBe(true);
    expect(canCancel("2026-03-01T11:59:00Z", now)).toBe(false);
    await expect(cancelAppointment({ id: "a-2", scheduledAt: "2026-03-01T11:00:00Z" }, now)).rejects.toMatchObject({ code: "CANCEL_TOO_LATE" });
  });

  it("only embeds https daily.co rooms", () => {
    expect(buildDailyEmbedUrl("https://mindsahaay.daily.co/room-1", "tok")).toBe("https://mindsahaay.daily.co/room-1?t=tok");
    expect(buildDailyEmbedUrl("http://mindsahaay.daily.co/room-1", "tok")).toBeNull();
    expect(buildDailyEmbedUrl("https://evil.example.com/room-1", "tok")).toBeNull();
    expect(buildDailyEmbedUrl("https://daily.co.evil.com/x", "tok")).toBeNull();
    expect(buildDailyEmbedUrl("not a url", "tok")).toBeNull();
  });

  it("converts a booking for the host app", () => {
    const host = toHostAppointment(
      { id: "a", counsellorId: "c", slotId: null, scheduledAt: inDays(1), status: "confirmed", meetingUrl: "", notes: "" },
      "Dr. A",
    );
    expect(host).toMatchObject({ id: "a", doctorId: "c", doctorName: "Dr. A", meetingUrl: undefined });
  });
});

describe("video session and confirmation modals", () => {
  const appt = { id: "a-1", doctorId: "c-1", doctorName: "Dr. Ananya", scheduledFor: "Tue 3 Mar", slotTime: "10:00 AM", status: "confirmed", bookedAt: "now" };

  it("opens the Daily prebuilt room with the issued token", async () => {
    mockCall.mockResolvedValueOnce({ token: "meeting-token", roomUrl: "https://mindsahaay.daily.co/appt-1", roomName: "appt-1" });
    render(<VideoSessionModal appointment={appt} onClose={() => undefined} />);
    const frame = await screen.findByTitle("Video consultation with Dr. Ananya");
    expect(frame).toHaveAttribute("src", "https://mindsahaay.daily.co/appt-1?t=meeting-token");
    expect(frame).toHaveAttribute("allow", expect.stringContaining("camera"));
    expect(mockCall).toHaveBeenCalledWith("POST", "/appointments/a-1/video-token", {});
  });

  it("refuses to embed an unrecognised room address", async () => {
    mockCall.mockResolvedValueOnce({ token: "t", roomUrl: "https://evil.example.com/x" });
    render(<VideoSessionModal appointment={appt} onClose={() => undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not recognised");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("shows an error with retry and a backup link when the token call fails", async () => {
    mockCall.mockRejectedValueOnce(new ApiError("forbidden", 403, "FORBIDDEN"));
    mockCall.mockResolvedValueOnce({ token: "t2", roomUrl: "https://mindsahaay.daily.co/r" });
    const user = userEvent.setup();
    render(<VideoSessionModal appointment={{ ...appt, meetingUrl: "https://meet.example/backup" }} onClose={() => undefined} />);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("link", { name: "Open backup link" })).toHaveAttribute("href", "https://meet.example/backup");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTitle(/Video consultation/)).toBeInTheDocument();
  });

  it("closes with Escape and has an explicit close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<VideoSessionModal appointment={null} onClose={onClose} />);
    expect(screen.getByText(/Choose an appointment/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Close video room" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("confirms a booking with the reference id", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BookingConfirmationModal appointment={appt} onClose={onClose} />);
    expect(screen.getByText("Reference: a-1")).toBeInTheDocument();
    expect(screen.getByText(/Session with Dr. Ananya on Tue 3 Mar at 10:00 AM/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});
