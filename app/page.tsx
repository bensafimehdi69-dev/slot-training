import { redirect } from "next/navigation"

// The bare URL has no marketing landing — anyone hitting / is bounced to the
// manager sign-in. Authenticated managers are routed onwards by the (manager)
// layout; athletes are redirected from /login to /athlete-login by the proxy
// when they don't have a manager session.
export default function Home() {
  redirect("/login")
}
