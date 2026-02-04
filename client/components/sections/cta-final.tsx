"use client";

import { motion, Variants } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1] as const, // Premium fountain-pen easing
    },
  },
};

export function CTAFinal() {
  return (
    <section className="py-24 px-6 bg-[#1C1C1C] overflow-hidden relative">
      {/* Decorative Gold Glow - Matches Desert Gold HSL 43 50% 59% */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,hsla(43,50%,59%,0.12)_0%,transparent_70%)] pointer-events-none" />

      <div className="container mx-auto max-w-4xl text-center relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={fadeUp}
        >
          {/* Label: Desert Gold with 0.3em tracking */}
          <p className="heading-elegant text-accent mb-8">
            Get Started
          </p>

          <h2 className="heading-display text-5xl md:text-[72px] text-white mb-10 leading-[1.1] font-light">
            Ready to Transform <br /> 
            <span className="text-accent italic">Your Research?</span>
          </h2>
          
          <p className="text-white/60 mb-14 max-w-xl mx-auto font-light text-lg md:text-xl leading-relaxed">
            Join the platform trusted by leading legal professionals for structured, 
            high-quality focus group research.
          </p>

          <div className="flex justify-center">
            <Link href="/auth/signup">
              {/* Button: Matches 14px Inter and Deep Onyx text color */}
              <button className={cn(
                "bg-accent text-[#1C1C1C] px-12 py-5 rounded-md transition-all duration-300",
                "font-sans font-semibold uppercase text-[12px] tracking-[0.2em]",
                "hover:bg-accent/90 hover:scale-105 active:scale-95 shadow-2xl shadow-accent/20"
              )}>
                Get Started Today
                <ArrowRight className="ml-2 h-4 w-4 transition-transform inline-block" />
              </button>
            </Link>
          </div>

          <p className="mt-12 text-[10px] text-white/20 heading-elegant tracking-[0.4em] uppercase font-medium">
            Secure Enrollment • 256-Bit Encryption
          </p>
        </motion.div>
      </div>
    </section>
  );
}