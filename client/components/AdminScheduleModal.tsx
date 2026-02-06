"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// Relative path to your lib/supabase/client
import { createClient } from "../lib/supabase/client"; 
import { Button } from "./ui/button"; 
import { Input } from "./ui/input";

interface ScheduleProps {
  caseId: string;
  currentTitle: string;
}

export function AdminScheduleModal({ caseId, currentTitle }: ScheduleProps) {
  const [dateTime, setDateTime] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  const supabase = createClient();
  const router = useRouter();

  const handleUpdate = async () => {
    setIsPending(true);

    const { error } = await supabase
      .from("cases")
      .update({ 
        scheduled_at: dateTime,
        updated_at: new Date().toISOString() 
      })
      .eq("id", caseId);

    if (!error) {
      setIsOpen(false);
      router.refresh(); 
    } else {
      alert("Database error: " + error.message);
    }
    
    setIsPending(false);
  };

  return (
    <>
      {/* The '+' Button that opens the custom modal */}
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setIsOpen(true)}
        className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200 font-bold"
      >
        + Schedule
      </Button>

      {/* Custom Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md border border-slate-200">
            <h2 className="text-xl font-bold mb-1 text-slate-900">Set Meeting Time</h2>
            <p className="text-sm text-slate-500 mb-6 italic">Case: {currentTitle}</p>
            
            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">
                  Select Date and Time
                </label>
                <Input
                  type="datetime-local"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8">
              <Button 
                variant="ghost" 
                onClick={() => setIsOpen(false)}
                className="text-slate-600"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpdate} 
                disabled={!dateTime || isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6"
              >
                {isPending ? "Saving..." : "Save Schedule"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}