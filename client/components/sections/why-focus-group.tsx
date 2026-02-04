"use client";

import { motion, Variants } from "framer-motion";
import { Users, Shield, ChartColumn, Calendar } from "lucide-react";

const features = [
  {
    title: "Smart Selection",
    description: "Demographic filtering ensures you connect with the right participants for your research.",
    icon: Users,
  },
  {
    title: "Privacy First",
    description: "Participants are selected, never exposed. Research integrity maintained at every step.",
    icon: Shield,
  },
  {
    title: "Rich Analytics",
    description: "Comprehensive insights into response rates, demographics, and session outcomes.",
    icon: ChartColumn,
  },
  {
    title: "Seamless Scheduling",
    description: "Integrated calendar management for sessions with automated reminders.",
    icon: Calendar,
  },
];

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } 
  },
};

export function WhyFocusGroup() {
  return (
    <section className="py-24 px-6 bg-[#F9F9F9]">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={itemVariants}
          className="text-center mb-16"
        >
          {/* Label: Desert Gold with high tracking */}
          <p className="heading-elegant text-accent mb-4 tracking-[0.3em] uppercase text-[14px] font-medium">
            Why FocusGroup
          </p>
          {/* Heading: High-contrast Onyx text */}
          <h2 className="heading-display text-4xl md:text-[56px] text-[#1C1C1C] font-light leading-[1.1]">
            Research, Refined
          </h2>
        </motion.div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={{
                ...itemVariants,
                visible: { 
                    ...itemVariants.visible, 
                    transition: { delay: index * 0.1, duration: 0.6 } 
                }
              }}
              className="bg-white p-8 rounded-lg border border-border/50 hover:shadow-xl hover:shadow-black/5 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-6">
                <feature.icon className="h-5 w-5 text-accent" />
              </div>
              <h3 className="font-semibold text-xl mb-3 heading-display text-[#1C1C1C]">
                {feature.title}
              </h3>
              <p className="text-[#1C1C1C]/70 text-sm font-light leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}