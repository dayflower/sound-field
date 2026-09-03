import { startClock } from "../shared/clock";

const clock = document.querySelector<HTMLElement>("#clock");

if (clock) {
  const stopClock = startClock(clock);
  window.addEventListener("pagehide", stopClock, { once: true });
}
