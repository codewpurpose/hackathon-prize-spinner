import { HackathonSite } from "../components/HackathonSite";

export default function HomePage() {
  const clerkConfigured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() && process.env.CLERK_SECRET_KEY?.trim(),
  );
  return <HackathonSite clerkConfigured={clerkConfigured} />;
}
