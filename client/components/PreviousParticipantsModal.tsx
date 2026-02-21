"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "./ui/button";
import Link from "next/link";
import {
    Users,
    ChevronRight,
    Calendar,
    Mail,
    User as UserIcon,
    Loader2
} from "lucide-react";
import { Badge } from "./ui/badge";

interface Participant {
    participant_id: string;
    invite_status: string;
    profiles: {
        id: string;
        email: string;
        full_name: string;
    } | null;
    jury_participants: {
        first_name: string;
        last_name: string;
        email: string;
    } | null;
}

interface CaseLineageData {
    id: string;
    title: string;
    session_cases: {
        session_id: string;
        sessions: {
            session_date: string;
            session_participants: Participant[];
        };
    }[];
}

interface Props {
    caseId: string;
    ancestorIds: string[];
}

export default function PreviousParticipantsModal({ caseId, ancestorIds }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [lineageData, setLineageData] = useState<CaseLineageData[]>([]);
    const supabase = createClient();

    const fetchLineageData = async () => {
        setLoading(true);
        const allIds = [caseId, ...ancestorIds];

        try {
            // 1. Fetch cases and their session participants (basic profiles only)
            const { data, error } = await supabase
                .from("cases")
                .select(`
                    id,
                    title,
                    session_cases (
                        session_id,
                        sessions (
                            id,
                            session_date,
                            session_participants (
                                participant_id,
                                invite_status,
                                profiles!participant_id (
                                    id,
                                    email,
                                    full_name
                                )
                            )
                        )
                    )
                `)
                .in("id", allIds);

            if (error) throw error;
            if (!data) return;

            // 2. Collect all unique participant IDs to fetch their jury_participants details
            const participantIds = new Set<string>();
            data.forEach((caseItem: any) => {
                caseItem.session_cases?.forEach((sc: any) => {
                    sc.sessions?.session_participants?.forEach((p: any) => {
                        if (p.participant_id) participantIds.add(p.participant_id);
                    });
                });
            });

            const uniqueIds = Array.from(participantIds);
            let juryDetailsMap: Record<string, any> = {};

            if (uniqueIds.length > 0) {
                const { data: juryData, error: juryError } = await supabase
                    .from("jury_participants")
                    .select("user_id, first_name, last_name, email")
                    .in("user_id", uniqueIds);

                if (!juryError && juryData) {
                    juryData.forEach(jd => {
                        juryDetailsMap[jd.user_id] = jd;
                    });
                }

                // FALLBACK: Check oldData for missing participants
                const missingIds = uniqueIds.filter(id => !juryDetailsMap[id]);
                if (missingIds.length > 0) {
                    const { data: oldData, error: oldError } = await supabase
                        .from("oldData")
                        .select("id, first_name, last_name, email")
                        .in("id", missingIds);

                    if (!oldError && oldData) {
                        oldData.forEach(od => {
                            juryDetailsMap[od.id] = {
                                user_id: od.id,
                                first_name: od.first_name,
                                last_name: od.last_name,
                                email: od.email
                            };
                        });
                    }
                }
            }

            // 3. Merge data and sort
            const sortedData = (allIds as string[])
                .map(id => {
                    const caseItem = data.find((c: any) => c.id === id);
                    if (!caseItem) return null;

                    // Deep merge jury details into each participant
                    const processedSessionCases = caseItem.session_cases?.map((sc: any) => ({
                        ...sc,
                        sessions: {
                            ...sc.sessions,
                            session_participants: sc.sessions?.session_participants?.map((p: any) => ({
                                ...p,
                                jury_participants: juryDetailsMap[p.participant_id] || null
                            }))
                        }
                    }));

                    return { ...caseItem, session_cases: processedSessionCases };
                })
                .filter(Boolean) as unknown as CaseLineageData[];

            setLineageData(sortedData);
        } catch (err: any) {
            console.error("Error fetching lineage participants:", err);
            // More detailed logging for the {} error case
            if (err.message) console.error("Error Message:", err.message);
            if (err.details) console.error("Error Details:", err.details);
            if (err.hint) console.error("Error Hint:", err.hint);
            if (err.code) console.error("Error Code:", err.code);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchLineageData();
        }
    }, [isOpen]);

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2"
            >
                <Users className="h-4 w-4" />
                View History
            </Button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden border">
                        <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900">Participant History</h2>
                                <p className="text-slate-500 text-sm mt-1">Viewing participants across Case Lineage</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="rounded-full h-8 w-8 p-0">
                                ✕
                            </Button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    <p className="text-slate-500 font-medium">Loading history...</p>
                                </div>
                            ) : lineageData.length > 0 ? (
                                <div className="space-y-12 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                                    {lineageData.map((caseItem, idx) => (
                                        <div key={caseItem.id} className="relative pl-10">
                                            {/* Timeline Dot */}
                                            <div className={`absolute left-0 top-1 w-8 h-8 rounded-full border-4 border-white shadow-sm flex items-center justify-center z-10 ${idx === 0 ? 'bg-blue-600' : 'bg-slate-300'}`}>
                                                {idx === 0 ? <Users className="h-4 w-4 text-white" /> : <History className="h-4 w-4 text-white" />}
                                            </div>

                                            <div className="flex items-center flex-wrap gap-3 mb-6">
                                                <h3 className={`text-lg font-bold min-w-[100px] ${idx === 0 ? 'text-blue-600' : 'text-slate-700'}`}>
                                                    {caseItem.title}
                                                </h3>
                                                {idx === 0 && (
                                                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 uppercase text-[10px] tracking-wider">
                                                        Current Case
                                                    </Badge>
                                                )}
                                                {idx > 0 && (
                                                    <Badge variant="outline" className="text-slate-400 uppercase text-[10px] tracking-wider">
                                                        Ancestor {idx}
                                                    </Badge>
                                                )}
                                            </div>

                                            {caseItem.session_cases.length > 0 ? (
                                                <div className="space-y-6">
                                                    {caseItem.session_cases.map((sc, sIdx) => (
                                                        <div key={sIdx} className="bg-slate-50 rounded-xl border p-4">
                                                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600 mb-4 pb-2 border-b border-slate-200">
                                                                <Calendar className="h-4 w-4" />
                                                                <span>Session: {new Date(sc.sessions.session_date).toLocaleDateString()}</span>
                                                                <Badge variant="outline" className="ml-auto bg-white">
                                                                    {sc.sessions.session_participants.length} Participants
                                                                </Badge>
                                                            </div>

                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                                {sc.sessions.session_participants.map((p, pIdx) => (
                                                                    <Link
                                                                        key={pIdx}
                                                                        href={`/dashboard/participant/${p.participant_id}?from=case&caseId=${caseItem.id}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center gap-3 bg-white p-3 rounded-lg border shadow-sm group hover:border-primary/30 transition-all hover:shadow-md cursor-pointer"
                                                                    >
                                                                        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                                            <UserIcon className="h-5 w-5" />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors truncate">
                                                                                {p.profiles?.full_name ||
                                                                                    (p.jury_participants ? `${p.jury_participants.first_name} ${p.jury_participants.last_name}` : null) ||
                                                                                    p.profiles?.email ||
                                                                                    p.jury_participants?.email ||
                                                                                    `Participant ${p.participant_id.slice(0, 8)}`}
                                                                            </p>
                                                                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                                                <Mail className="h-3 w-3" />
                                                                                <span className="truncate">{p.profiles?.email || p.jury_participants?.email || "No email"}</span>
                                                                            </div>
                                                                        </div>
                                                                        <Badge
                                                                            variant={p.invite_status === 'accepted' ? 'default' : p.invite_status === 'pending' ? 'outline' : 'destructive'}
                                                                            className="text-[9px] uppercase h-5 pointer-events-none"
                                                                        >
                                                                            {p.invite_status}
                                                                        </Badge>
                                                                    </Link>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="bg-slate-50 border border-dashed rounded-xl p-6 text-center">
                                                    <p className="text-sm text-slate-400 italic">No sessions conducted for this case yet.</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-20">
                                    <Users className="h-12 w-12 text-slate-200 mx-auto mb-4" />
                                    <p className="text-slate-500">No participant history found for this case or its ancestors.</p>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t bg-slate-50 flex justify-end">
                            <Button onClick={() => setIsOpen(false)}>Close History</Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function History({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l4 2" />
        </svg>
    );
}
