"use client";

import { MapPin } from "lucide-react";
import { OFFLINE_VENUE } from "@/lib/constants/offline-catchment";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
};

/**
 * "Are you interested in in-person focus groups?" — stored as 'Yes' / 'No' in
 * jury_participants.interested_in_offline. Shared by the signup and edit-profile
 * forms so both ask the same question about the same venue.
 */
export default function OfflineInterestField({ value, onChange, required = true }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor="interested_in_offline">
        Are you interested in in-person (offline) focus groups?
        {required && <span className="text-red-500"> *</span>}
      </Label>
      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Held at {OFFLINE_VENUE.name} · {OFFLINE_VENUE.address}
        </span>
      </p>
      <div className="md:w-1/2">
        <Select value={value} onValueChange={onChange} required={required}>
          <SelectTrigger id="interested_in_offline"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Yes">Yes</SelectItem>
            <SelectItem value="No">No</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
