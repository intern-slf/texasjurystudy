"use client";

import { motion } from "framer-motion"; // Required for premium motion
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, Building2, Globe, ArrowRight } from "lucide-react";
import Link from "next/link";

// Animation Variants for orchestrated entrance
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } 
  },
};

export default function PresenterOnboarding() {
  return (
    <motion.main 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-4xl mx-auto px-6 py-24 space-y-12"
    >
      {/* Header Section */}
      <motion.div variants={itemVariants} className="text-center space-y-4">
        <p className="heading-elegant text-accent tracking-[0.2em]">Step One</p>
        <h1 className="text-5xl font-light heading-display">
          Presenter <span className="text-accent">Onboarding</span>
        </h1>
        <p className="max-w-xl mx-auto text-muted-foreground leading-relaxed">
          Before creating your first focus group, we need to define your professional 
          research profile and organizational requirements.
        </p>
      </motion.div>

      {/* Feature/Requirement Preview Grid */}
      <motion.div variants={itemVariants} className="grid md:grid-cols-3 gap-6">
        {[
          { icon: Building2, label: "Organization", desc: "Define your law firm or research agency." },
          { icon: Briefcase, label: "Specialization", desc: "Set your primary fields of legal study." },
          { icon: Globe, label: "Compliance", desc: "Verify research ethics and data standards." },
        ].map((item) => (
          <Card key={item.label} className="glass-card border-muted/40 p-6 space-y-3 group">
            <div className="h-10 w-10 rounded-full bg-accent/5 flex items-center justify-center group-hover:bg-accent/10 transition-colors">
              <item.icon className="h-5 w-5 text-accent" />
            </div>
            <h3 className="heading-elegant text-[11px] font-medium">{item.label}</h3>
            <p className="text-xs text-muted-foreground leading-tight">{item.desc}</p>
          </Card>
        ))}
      </motion.div>

      {/* Action Area */}
      <motion.div variants={itemVariants} className="flex flex-col items-center space-y-6 pt-6">
        <div className="w-full h-px bg-gradient-to-r from-transparent via-muted to-transparent" />
        
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button 
            className="px-12 h-14 bg-primary text-primary-foreground rounded-full heading-elegant text-[11px] shadow-xl hover:shadow-accent/20 transition-all border border-primary/10"
          >
            Start Account Setup
            <ArrowRight className="ml-2 h-4 w-4 text-accent" />
          </Button>
        </motion.div>

        <p className="text-[10px] heading-elegant text-muted-foreground tracking-widest">
          Estimated time: 3 minutes
        </p>
      </motion.div>
    </motion.main>
  );
}