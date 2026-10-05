/**
 * Finds work-authorization restrictions in job text: US citizens / Green Card holders only, no visa sponsorship,
 * security clearance or export-control (US persons) requirements. A candidate who needs sponsorship can't take
 * these jobs, so they are kept out of their matches, apply queue and recruiter replies.
 *
 * Returns a short reason, or null when the text sets no such restriction. Generic EEO wording ("regardless of
 * citizenship") and "citizen, permanent resident or otherwise authorized to work" are not restrictions.
 */

interface Rule {
  reason: string;
  pattern: RegExp;
  /** Text right after a match that turns it into an open requirement ("...or otherwise authorized to work") */
  unless?: RegExp;
  /** Matched words that make it no restriction ("does not guarantee sponsorship") */
  notIf?: RegExp;
  /** Anywhere in the text: the restriction doesn't apply ("H-1B transfers welcome" with "can't sponsor new H-1B") */
  exceptWhen?: RegExp;
}

const OPEN_TO_OTHERS = /otherwise|or (other )?(valid )?(work )?(authori[sz]|visa|eligib|permit)|(authori[sz]ed|eligible) to work|work authori[sz]ation/;

const RULES: Rule[] = [
  {
    reason: 'No visa sponsorship',
    pattern: new RegExp([
      String.raw`\b(no|not|unable to|cannot|can not|will not|won't|do not|does not|don't|doesn't|not able to|not in a position to)\b[^.;\n]{0,40}\b(sponsor|sponsorship|sponsoring)\b`,
      String.raw`\bwithout (the )?(need for |needing |requiring |requirement of )?(current or future |future |any |now or in the future )?(visa |employment |immigration )?sponsorship`,
      String.raw`\bsponsorship (is |will )?(not|n't) (be )?(available|offered|provided|possible|supported|considered)`,
      String.raw`\b(not|in)eligible for (visa |employment )?sponsorship`,
      String.raw`\bvisa sponsorship:? ?(no\b|none|not available|n/a)`,
      String.raw`\b(no|not accepting|cannot accept|can't accept) h-?1b`,
      String.raw`\bh-?1b (candidates |holders |visas? )?(are |is )?(not|n't) (accepted|considered|sponsored|eligible)`
    ].join('|')),
    notIf: /guarantee/,
    // Someone already on an H-1B can still transfer it
    exceptWhen: /h-?1b transfers?( candidates)? (are |is )?(welcome|accepted|encouraged|considered|ok|supported)|(accept|consider|welcome|support)(s|ing)? h-?1b transfers?|transfer (of )?(your |an )?(existing )?h-?1b/
  },
  {
    reason: 'Requires US citizenship or a Green Card',
    pattern: new RegExp([
      String.raw`\busc ?(/|or|and|&) ?gc\b`,
      String.raw`\bgc ?(/|or|and|&) ?usc\b`,
      String.raw`\b(us )?citizens? (or|and|/) (green card holders?|permanent residents?|gc holders?)( only)?\b`,
      String.raw`\b(green card|gc) holders? only\b`,
      String.raw`\bpermanent residents? only\b`,
      String.raw`\bmust (be|hold) (a |an )?(green card|permanent resident|gc holder)`
    ].join('|')),
    unless: OPEN_TO_OTHERS
  },
  {
    reason: 'Requires US citizenship',
    pattern: new RegExp([
      String.raw`\b(us|united states|american) citizens?(hip)? (only|required|is required|is mandatory|mandatory)\b`,
      String.raw`\bonly (us|united states) citizens\b`,
      String.raw`\b(requires?|requiring) (us|united states) citizenship\b`,
      String.raw`\bmust (be|have) (a )?(us|united states) citizen(ship)?\b`,
      String.raw`\busc only\b`
    ].join('|')),
    unless: OPEN_TO_OTHERS
  },
  {
    reason: 'Requires a security clearance (US citizens only)',
    pattern: new RegExp([
      String.raw`\b(active|current|existing) (dod |us )?(secret|top secret|ts/sci|ts|public trust)( / ?\w+)? (security )?clearance`,
      String.raw`\b(active|current|existing) (dod |us |federal )?security clearance\b`,
      String.raw`\bsecurity clearance (is )?(required|needed|mandatory)`,
      String.raw`\b(must|required to|ability to|able to) (obtain|hold|maintain|possess) (a |an )?(dod |us |active )?(secret|top secret|ts/sci|security) clearance`,
      String.raw`\bclearance required\b`
    ].join('|'))
  },
  {
    reason: 'Export-control role (US persons only)',
    pattern: new RegExp([
      String.raw`\bitar\b`,
      String.raw`\bmust be a us person\b`,
      String.raw`\bus persons? only\b`,
      String.raw`\bus person status\b`
    ].join('|'))
  }
];

/** Lower-cases and normalizes "U.S." / "U.S.A." to "us" so the rules stay simple */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bu\.\s?s\.(\s?a\.)?/g, 'us')
    .replace(/\busa\b/g, 'us')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ');
}

/** The restriction and the words that triggered it (shown to the user so they can judge it) */
export function findWorkAuthRestriction(...texts: (string | string[] | undefined | null)[]): { reason: string; evidence: string } | null {
  const text = normalize(texts.flat().filter(Boolean).join('\n'));
  if (!text) return null;
  for (const rule of RULES) {
    if (rule.exceptWhen?.test(text)) continue;
    const pattern = new RegExp(rule.pattern.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const end = match.index + match[0].length;
      if (rule.unless?.test(text.slice(end, end + 80)) || rule.notIf?.test(match[0])) continue;
      const evidence = text.slice(Math.max(0, match.index - 60), end + 40).trim();
      return { reason: rule.reason, evidence: `…${evidence}…` };
    }
  }
  return null;
}

export function workAuthRestriction(...texts: (string | string[] | undefined | null)[]): string | null {
  return findWorkAuthRestriction(...texts)?.reason ?? null;
}

/** True when the profile says the candidate needs visa sponsorship */
export function needsSponsorship(profile: any): boolean {
  const sq = (typeof profile?.toObject === 'function' ? profile.toObject() : profile)?.screeningQuestions || {};
  return sq.requiresSponsorship === true || sq.workAuthorization === 'require_sponsorship';
}
