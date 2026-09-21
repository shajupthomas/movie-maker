import { StudioError } from "./errors";

const SEXUAL = /\b(sex|sexual|nude|naked|porn|erotic|rape|incest|molest|xxx)\b/i;
const MINOR =
  /\b(child|children|kid|kids|minor|minors|underage|toddler|infant|preteen|schoolboy|schoolgirl|little girl|little boy)\b/i;
const UNDER_18 = /\b(?:1[0-7]|[1-9])\s*[- ]?(?:year|yr)s?\s*[- ]?old\b/i;
const ROMANTIC = /\b(romance|romantic|dating|lover|girlfriend|boyfriend)\b/i;

export function assertBriefAllowed(brief: string): void {
  const underage = MINOR.test(brief) || UNDER_18.test(brief);
  if (underage && (SEXUAL.test(brief) || (UNDER_18.test(brief) && ROMANTIC.test(brief)))) {
    throw new StudioError(
      "This studio cannot develop sexual or romantic stories involving minors.",
      400,
    );
  }
}
