import React from "react";
import { Outlet } from "react-router";
import DemoBanner from "./DemoBanner";

export default function AuthLayout() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <DemoBanner />
      <div id="main-content">
        <Outlet />
      </div>
    </>
  );
}
