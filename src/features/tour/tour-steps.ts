export type TourStep = { target: string; title: string; body: string };

/** Each `target` matches a data-tour="..." attribute somewhere on the home page. */
export const TOUR_STEPS: TourStep[] = [
  {
    target: "tour-operator",
    title: "Say who's at the desk",
    body: "Pick your name here first — every upload, print and edit gets logged against it.",
  },
  {
    target: "tour-upload",
    title: "Drop badge files here",
    body: "Any number of PDFs from the registration platform. They're checked for duplicates automatically.",
  },
  {
    target: "tour-nav-queue",
    title: "The queue",
    body: "Every badge waiting to print, from everyone's uploads. Full sheets of 4 print themselves — nothing to do for a clean batch.",
  },
  {
    target: "tour-nav-records",
    title: "Records",
    body: "The full searchable history of every badge: printed or not, by whom, when.",
  },
  {
    target: "tour-quickfind",
    title: "Find a badge fast",
    body: "Ctrl/Cmd+K from anywhere to jump straight to a badge by name, chapter or ID.",
  },
];
