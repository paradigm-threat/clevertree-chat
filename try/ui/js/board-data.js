/**
 * Shared sample board for UI lab / mockup implementation.
 * Topic mirrors flock-cameras demos; not live host data.
 */
(function (global) {
  const TOPIC = {
    id: "flock-cameras",
    title: "Should cities use camera networks?",
    invite: "Explore the main perspectives, then add your own point.",
  };

  const KEYS = [
    {
      id: "investigative-benefits",
      title: "Cameras may improve investigations",
      rank: 1,
      prominence: 92,
      summary:
        "License-plate and street cameras can help solve crimes faster by providing timelines and leads investigators would otherwise lack.",
      countersTo: ["privacy-concerns", "oversight-retention"],
      counterLabels: {
        "privacy-concerns": "Privacy concerns",
        "oversight-retention": "Misuse risks",
      },
      responsesToCounters: [
        {
          against: "privacy-concerns",
          text: "Investigative value depends on narrow warrants and audited access, not unbounded retention.",
        },
        {
          against: "oversight-retention",
          text: "Clear retention caps and public logs can keep tools useful without permanent dossiers.",
        },
      ],
    },
    {
      id: "privacy-concerns",
      title: "Surveillance creates privacy concerns",
      rank: 2,
      prominence: 88,
      summary:
        "Always-on camera nets normalize mass tracking of ordinary movement, chilling association and inviting mission creep.",
      countersTo: ["investigative-benefits", "legal-authority"],
      counterLabels: {
        "investigative-benefits": "Investigative benefits",
        "legal-authority": "Legal authority",
      },
      responsesToCounters: [
        {
          against: "investigative-benefits",
          text: "Solving some crimes does not justify continuous location histories on people who are not suspects.",
        },
        {
          against: "legal-authority",
          text: "Lawfulness of a purchase order is not the same as legitimacy of pervasive tracking.",
        },
      ],
    },
    {
      id: "oversight-retention",
      title: "Oversight and retention rules matter",
      rank: 3,
      prominence: 71,
      summary:
        "The decisive question is governance: who can query, how long data lives, and what independent audit looks like.",
      countersTo: ["investigative-benefits", "privacy-concerns"],
      counterLabels: {
        "investigative-benefits": "Investigative benefits",
        "privacy-concerns": "Privacy concerns",
      },
      responsesToCounters: [
        {
          against: "privacy-concerns",
          text: "Strong deletion schedules and query warrants reduce the privacy harm without banning cameras outright.",
        },
      ],
    },
    {
      id: "legal-authority",
      title: "Legal authority is unsettled or contested",
      rank: 4,
      prominence: 64,
      summary:
        "Cities cite existing police powers; critics argue some deployments outrun statute, disclosure, or constitutional limits.",
      countersTo: ["privacy-concerns"],
      counterLabels: { "privacy-concerns": "Privacy concerns" },
      responsesToCounters: [
        {
          against: "privacy-concerns",
          text: "If statutes are thin, the fix is legislation and disclosure—not only moral objection.",
        },
      ],
    },
  ];

  const POSTS = [
    {
      id: "p1",
      body: "We cleared three hit-and-runs last year only because of plate reads. Without the net those cases go cold.",
      keys: ["investigative-benefits"],
      provisionalKeys: [],
      author: "peer",
      simulated: true,
      flagged: null,
      createdAt: "2026-03-01T14:02:00Z",
    },
    {
      id: "p2",
      body: "I am not a suspect and I still show up in weeks of travel history whenever someone queries a plate near my block.",
      keys: ["privacy-concerns"],
      provisionalKeys: [],
      author: "peer",
      simulated: true,
      flagged: null,
      createdAt: "2026-03-01T14:08:00Z",
    },
    {
      id: "p3",
      body: "Keep the cameras if you want, but publish every query and auto-delete non-hit footage after 7 days.",
      keys: ["oversight-retention", "privacy-concerns"],
      provisionalKeys: [],
      author: "peer",
      simulated: true,
      flagged: null,
      createdAt: "2026-03-01T14:15:00Z",
    },
    {
      id: "p4",
      body: "The procurement docs never mentioned ALPR sharing with out-of-state agencies. That feels unlawful by omission.",
      keys: ["legal-authority"],
      provisionalKeys: [],
      author: "peer",
      simulated: true,
      flagged: null,
      createdAt: "2026-03-01T14:22:00Z",
    },
    {
      id: "p5",
      body: "People keep calling this racist surveillance. Maybe look at the clearance rates in the neighborhoods that asked for it.",
      keys: ["investigative-benefits"],
      provisionalKeys: [],
      author: "peer",
      simulated: true,
      flagged: {
        category: "potential-abuse",
        severity: "soft",
        visibility: "click-to-view",
        contestOpen: true,
        note: "Heated framing; hidden pending contest. Not deleted.",
      },
      createdAt: "2026-03-01T14:40:00Z",
    },
    {
      id: "p6",
      body: "What happens when immigration or protesters become the next query category? Once the pipe exists, pressure follows.",
      keys: ["privacy-concerns", "oversight-retention"],
      provisionalKeys: [],
      author: "peer",
      simulated: true,
      flagged: null,
      createdAt: "2026-03-01T15:01:00Z",
    },
    {
      id: "p7",
      body: "Detectives already had probable cause. The cameras just shortened the search from weeks to hours.",
      keys: ["investigative-benefits"],
      provisionalKeys: [],
      author: "peer",
      simulated: true,
      flagged: null,
      createdAt: "2026-03-01T15:12:00Z",
    },
  ];

  const ACTIVITY = [
    { id: "a1", kind: "live", text: "Simulated participant added a point", at: "15:12", highlight: false },
    { id: "a2", kind: "batch", text: "Board updated", at: "14:55", highlight: false },
    { id: "a3", kind: "flag", text: "Potential issue · Click to view on one point", at: "14:41", highlight: false },
    { id: "a4", kind: "live", text: "Your point is live", at: "14:30", highlight: false },
  ];

  function cloneBoard() {
    return {
      topic: { ...TOPIC },
      keys: KEYS.map((k) => ({
        ...k,
        countersTo: [...k.countersTo],
        counterLabels: { ...(k.counterLabels || {}) },
        responsesToCounters: k.responsesToCounters.map((r) => ({ ...r })),
      })),
      posts: POSTS.map((p) => ({
        ...p,
        keys: [...p.keys],
        provisionalKeys: [...(p.provisionalKeys || [])],
        flagged: p.flagged ? { ...p.flagged } : null,
      })),
      activity: ACTIVITY.map((a) => ({ ...a })),
    };
  }

  global.ClevertreeUiLabData = { TOPIC, KEYS, POSTS, ACTIVITY, cloneBoard };
})(typeof window !== "undefined" ? window : globalThis);
