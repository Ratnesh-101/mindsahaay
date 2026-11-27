/**
 * OFFLINE DEMO PREVIEW DATA ONLY.
 * This mock data is strictly scoped for offline preview mode (e.g. DemoDoctorsView, DemoJournalView)
 * and must NEVER be imported or displayed in real signed-in student views or the main Dashboard.
 */

export interface UserProfile {
  name: string;
  email: string;
  institution: string;
  initials: string;
}

export interface Doctor {
  name: string;
  role: string;
  city: string;
  state: string;
  rating: string;
  exp: string;
  next: string;
  image: string;
  speciality: string;
  slots: string[];
}

export const sampleUsers: UserProfile[] = [
  { name: "Aarav Singh", email: "aarav.singh@du.ac.in", institution: "Delhi University", initials: "AS" },
  { name: "Priya Sharma", email: "priya.s@iitb.ac.in", institution: "IIT Bombay", initials: "PS" },
  { name: "Rohan Verma", email: "rohan.v@bits-pilani.ac.in", institution: "BITS Pilani", initials: "RV" },
];

export const doctors: Doctor[] = [
  {
    name: "Dr. Ananya Sharma",
    role: "Clinical Psychologist",
    city: "Bengaluru, Karnataka",
    state: "Karnataka",
    rating: "4.9",
    exp: "12 yrs",
    next: "Today, 4:30 PM",
    image: "https://images.unsplash.com/photo-1659353888906-adb3e0041693?crop=faces&fit=crop&w=300&h=300&q=80",
    speciality: "Psychologist",
    slots: ["Today, 4:30 PM", "Tomorrow, 11:00 AM", "Tomorrow, 3:30 PM", "Thu, 5:00 PM"],
  },
  {
    name: "Dr. Arjun Mehta",
    role: "Counselling Psychologist",
    city: "New Delhi, Delhi",
    state: "Delhi",
    rating: "4.8",
    exp: "9 yrs",
    next: "Tomorrow, 10:00 AM",
    image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?crop=faces&fit=crop&w=300&h=300&q=80",
    speciality: "Psychologist",
    slots: ["Tomorrow, 10:00 AM", "Tomorrow, 2:00 PM", "Wed, 4:00 PM", "Fri, 11:30 AM"],
  },
  {
    name: "Dr. Kabir Rao",
    role: "Psychiatrist",
    city: "Mumbai, Maharashtra",
    state: "Maharashtra",
    rating: "4.7",
    exp: "15 yrs",
    next: "Wed, 2:00 PM",
    image: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?crop=faces&fit=crop&w=300&h=300&q=80",
    speciality: "Psychiatrist",
    slots: ["Wed, 2:00 PM", "Thu, 10:30 AM", "Thu, 3:00 PM", "Sat, 1:00 PM"],
  },
];

export const navItems = [
  { id: "dashboard", label: "Overview", icon: "home" },
  { id: "insights", label: "My insights", icon: "chart" },
  { id: "assessment", label: "Mental test", icon: "test" },
  { id: "doctors", label: "Directory", icon: "doctors" },
  { id: "chat", label: "MindMate AI", icon: "chat" },
  { id: "journal", label: "Journal & Tools", icon: "book" },
  { id: "stories", label: "Campus stories", icon: "users" },
] as const;

export default {
  sampleUsers,
  doctors,
  navItems,
};
