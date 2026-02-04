"use client";

import { motion, Variants } from "framer-motion"; // Added Variants type
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

// Explicitly typed as Variants to satisfy TS
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.3 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { 
      duration: 0.5, 
      // 'as const' ensures TypeScript treats this as a fixed cubic-bezier tuple
      ease: [0.4, 0, 0.2, 1] as const 
    } 
  },
};

export function Features() {
  return (
    <section className="py-24 px-6 bg-secondary/30 relative overflow-hidden">
      <div className="container mx-auto max-w-6xl relative z-10">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-20"
        >
          <p className="heading-elegant text-accent mb-4 tracking-widest uppercase text-[10px] font-bold">
            Why FocusGroup
          </p>
          <h2 className="heading-display text-4xl md:text-5xl text-foreground font-light">
            Research, Refined
          </h2>
        </motion.div>

        {/* Grid */}
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid md:grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              whileHover={{ y: -8 }}
              className="bg-card p-8 rounded-2xl border border-border/50 hover:shadow-2xl hover:shadow-accent/5 transition-all duration-500 group"
            >
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-6 group-hover:bg-accent group-hover:text-accent-foreground transition-colors duration-500">
                <feature.icon className="h-5 w-5 text-accent group-hover:text-white transition-colors" />
              </div>
              <h3 className="font-medium text-lg mb-3 heading-display tracking-tight">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm font-light leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}