export type FocusGroupVideo = {
  question: string;
  url: string;
};

export const FOCUS_GROUP_VIDEOS = {
  general: {
    title: "What Texas Jury Study Will Provide After Concluding the Focus Group",
    url: "https://www.loom.com/share/ee0c157c632c4f56b40a80f2dc54aa9c",
  },
  narrative: [
    {
      question: "What is the purpose of a narrative focus group?",
      url: "https://www.loom.com/share/4710ec50a536499e91608b5621ed3c85",
    },
    {
      question: "At what phase of the case could one conduct a narrative focus group?",
      url: "https://www.loom.com/share/5dc1e2a35b3649a5946973d609b0681f",
    },
    {
      question: "What materials are required to submit a case for a narrative focus group?",
      url: "https://www.loom.com/share/b978997021d244d2ba5ef9fa9e20e055",
    },
  ] as FocusGroupVideo[],
  openingStatement: [
    {
      question: "How is an opening statement focus group conducted and what is the ideal timeframe for holding one?",
      url: "https://www.loom.com/share/189f994579bd48b8b11f205b6c415628",
    },
    {
      question: "How does the opening statement focus group work?",
      url: "https://www.loom.com/share/39ca74247ec44a3588848c0b8157e4e8",
    },
    {
      question: "What is the best way to organize opening statement focus groups, and who presents which side?",
      url: "https://www.loom.com/share/bec0110497054d03916233aa1518d7e6",
    },
  ] as FocusGroupVideo[],
};

export function videosForFocusGroupType(type: string | null | undefined): FocusGroupVideo[] {
  if (type === "Narrative Type") return FOCUS_GROUP_VIDEOS.narrative;
  if (type === "Opening Statement") return FOCUS_GROUP_VIDEOS.openingStatement;
  return [];
}

export function focusGroupBlurb(type: string | null | undefined): string {
  if (type === "Narrative Type") {
    return "Present your case as a story. Walk participants through the facts chronologically and let them respond to the narrative as it unfolds.";
  }
  if (type === "Opening Statement") {
    return "Deliver your opening statement to the participants as if they were jurors. Gather their feedback on persuasiveness and clarity.";
  }
  return "Customize your session format as needed. Follow the admin-provided instructions for this focus group type.";
}
