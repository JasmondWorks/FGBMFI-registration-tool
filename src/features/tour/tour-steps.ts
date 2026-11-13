export type TourStep = { target: string; title: string; body: string };

/**
 * On a narrow screen the nav links aren't in the topbar at all — they're behind the
 * hamburger menu — so the mobile version of the tour has one extra step pointing at that
 * button before it can spotlight anything inside it.
 */
export function getTourSteps(isMobile: boolean): TourStep[] {
  const steps: TourStep[] = [
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
  ];
  if (isMobile) {
    steps.push({
      target: "tour-hamburger",
      title: "Open the menu",
      body: "Tap here to get to Queue, Records and everything else — the menu lives behind this button on a phone.",
    });
  }
  steps.push(
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
  );
  if (!isMobile) {
    steps.push({
      target: "tour-quickfind",
      title: "Find a badge fast",
      body: "Ctrl/Cmd+K from anywhere to jump straight to a badge by name, chapter or ID.",
    });
  }
  return steps;
}
