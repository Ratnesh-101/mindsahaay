import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CampusStories from "./CampusStories";
import { wellnessApi, type CommunityStory } from "../../api";
import * as CommunityApi from "../community/api";
import I18nProvider from "../../app/providers/I18nProvider";
import QueryProvider from "../../app/providers/QueryProvider";

const mockStories: CommunityStory[] = [
  {
    id: "story-1",
    theme: "Exams & Burnout",
    title: "Surviving End-Sem Pressure at Delhi University",
    excerpt: "When syllabus felt endless, 4-7-8 breathing kept me grounded.",
    fullText: "Full story text here...",
    readTime: "3 min read",
    campus: "Delhi University",
    author: "Mathematics Student",
    likes: 12,
  },
  {
    id: "story-2",
    theme: "Homesickness",
    title: "First Diwali Away From Home in Hostel",
    excerpt: "How campus peer circles became my chosen family.",
    fullText: "Full Diwali story...",
    readTime: "4 min read",
    campus: "IIT Delhi",
    author: "Hostel Resident",
    likes: 8,
  },
];

describe("CampusStories Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(wellnessApi, "getStories").mockResolvedValue(mockStories);
    vi.spyOn(wellnessApi, "likeStory").mockImplementation(async (id: string) => {
      return mockStories.map((s) => (s.id === id ? { ...s, likes: s.likes + 1 } : s));
    });
    vi.spyOn(CommunityApi, "fetchMyRole").mockResolvedValue("student");
  });

  function renderStories(onSelectStory = vi.fn()) {
    return render(
      <QueryProvider>
        <I18nProvider>
          <CampusStories onSelectStory={onSelectStory} />
        </I18nProvider>
      </QueryProvider>
    );
  }

  it("renders stories list and filters by theme", async () => {
    renderStories();

    await waitFor(() => {
      expect(screen.getByText("Surviving End-Sem Pressure at Delhi University")).toBeInTheDocument();
      expect(screen.getByText("First Diwali Away From Home in Hostel")).toBeInTheDocument();
    });

    // Filter by Homesickness
    const homesickFilter = screen.getByRole("button", { name: /Homesickness/i });
    fireEvent.click(homesickFilter);

    expect(screen.getByText("First Diwali Away From Home in Hostel")).toBeInTheDocument();
    expect(screen.queryByText("Surviving End-Sem Pressure at Delhi University")).toBeNull();
  });

  it("triggers onSelectStory when clicking a story title", async () => {
    const onSelect = vi.fn();
    renderStories(onSelect);

    const storyTitleBtn = await screen.findByRole("button", {
      name: /Read story: Surviving End-Sem Pressure at Delhi University/i,
    });
    fireEvent.click(storyTitleBtn);

    expect(onSelect).toHaveBeenCalledWith(mockStories[0]);
  });

  it("handles like action", async () => {
    renderStories();

    const likeButtons = await screen.findAllByRole("button", { name: /Mark story helpful/i });
    fireEvent.click(likeButtons[0]);

    await waitFor(() => {
      expect(wellnessApi.likeStory).toHaveBeenCalledWith("story-1");
    });
  });

  it("shows moderation tab when user has moderator role", async () => {
    vi.spyOn(CommunityApi, "fetchMyRole").mockResolvedValue("moderator");
    renderStories();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Moderator queue/i })).toBeInTheDocument();
    });
  });
});
