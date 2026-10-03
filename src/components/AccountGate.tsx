"use client";

import { SignInButton, SignOutButton, SignUpButton, useUser } from "@clerk/nextjs";
import { useEffect } from "react";

function AccountActions() {
  const { isLoaded, isSignedIn, user } = useUser();
  const primaryEmail = user?.primaryEmailAddress;
  const emailVerified = primaryEmail?.verification.status === "verified";

  useEffect(() => {
    if (isLoaded) window.dispatchEvent(new Event("cwp:account-changed"));
  }, [isLoaded, isSignedIn, user?.id, emailVerified]);

  if (!isLoaded) return <p className="account-loading" role="status">Checking your CWP account…</p>;

  if (!isSignedIn) {
    return (
      <div className="account-actions">
        <SignInButton mode="modal">
          <button className="gate-button" type="button">Sign in to CWP</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="account-signup" type="button">Create a free account</button>
        </SignUpButton>
      </div>
    );
  }

  return (
    <div className="account-session">
      <span className="account-email">
        {emailVerified
          ? `Signed in as ${primaryEmail.emailAddress}`
          : "Verify your CWP account email to unlock the wheel."}
      </span>
      <SignOutButton redirectUrl="/">
        <button className="account-signout" type="button">Log out</button>
      </SignOutButton>
    </div>
  );
}

export function AccountGate({ configured }: { configured: boolean }) {
  if (!configured) {
    return <p className="account-loading" role="status">CWP account sign-in is not configured in this environment.</p>;
  }
  return <AccountActions />;
}
