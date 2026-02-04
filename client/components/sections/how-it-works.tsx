"use client";

import { motion, Variants } from "framer-motion";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } 
  },
};

const presenterSteps = [
  "Create focus groups with detailed criteria",
  "Define demographic filters and screening questions",
  "Review and select qualified participants",
  "Conduct sessions via your preferred platform",
];

const participantSteps = [
  "Complete your demographic profile",
  "Wait to be matched with relevant studies",
  "Receive invitations when selected",
  "Join sessions and share your insights",
];

export function HowItWorks() {
  return (
    <section className="py-24 px-6 bg-background">
      <div className="container mx-auto max-w-5xl">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={itemVariants}
          className="text-center mb-20"
        >
          {/* Label: Desert Gold with High Tracking */}
          <p className="heading-elegant text-accent mb-4 tracking-[0.3em] uppercase text-[14px] font-medium">
            How It Works
          </p>
          {/* Heading: 72px Inter Look */}
          <h2 className="heading-display text-4xl md:text-[56px] text-[#1C1C1C] leading-[1.1] font-light">
            Simple. Structured. <span className="text-accent italic">Effective.</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-16">
          {/* Presenters Column */}
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="space-y-8"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-full bg-[#1C1C1C] flex items-center justify-center shadow-lg shadow-black/10">
                <span className="text-white font-semibold">P</span>
              </div>
              <h3 className="text-2xl font-semibold heading-display text-[#1C1C1C]">For Presenters</h3>
            </div>
            
            <div className="space-y-6 pl-2">
              {presenterSteps.map((step, i) => (
                <motion.div key={i} variants={itemVariants} className="flex items-start gap-4">
                  <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-[12px] flex items-center justify-center flex-shrink-0 mt-1 font-bold">
                    {i + 1}
                  </span>
                  <p className="text-[#1C1C1C]/80 font-medium leading-relaxed">{step}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Participants Column */}
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="space-y-8"
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
                <span className="text-[#1C1C1C] font-semibold">P</span>
              </div>
              <h3 className="text-2xl font-semibold heading-display text-[#1C1C1C]">For Participants</h3>
            </div>
            
            <div className="space-y-6 pl-2">
              {participantSteps.map((step, i) => (
                <motion.div key={i} variants={itemVariants} className="flex items-start gap-4">
                  <span className="w-6 h-6 rounded-full bg-accent/10 text-accent text-[12px] flex items-center justify-center flex-shrink-0 mt-1 font-bold">
                    {i + 1}
                  </span>
                  <p className="text-[#1C1C1C]/80 font-medium leading-relaxed">{step}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}