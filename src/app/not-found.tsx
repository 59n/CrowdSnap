import { redirect } from "next/navigation";

/**
 * Any remaining notFound() in the app sends users home
 * (guest unknown-event already redirects in the event page).
 */
export default function NotFound() {
  redirect("/");
}
