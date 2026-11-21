import React from "react";
import CirclesPanel from "../community/CirclesPanel";

export interface PeerCircle {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
}

/** Campus Circles hub. The real circles, anonymous posts, reporting and AI pre-moderation live in features/community. */
export default function CampusCirclesHub() {
  return <CirclesPanel />;
}
