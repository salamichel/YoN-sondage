/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Music, Users, Check, X, HelpCircle, Loader2, ExternalLink, TrendingUp, Clock, SortAsc, Trophy, CheckCircle2, XCircle, Archive, BookOpen, Settings, UserPlus, UserMinus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type VoteStatus = 'OK' | 'POURQUOI PAS' | 'KO' | null;

interface Question {
  id: number;
  texte: string;
  lien: string;
  status: 'active' | 'validated' | 'rejected';
}

interface Member {
  pseudo: string;
  active: number;
}

interface Vote {
  pseudo: string;
  reponses: Record<number, string>;
}

const MEMBERS = []; // Removed hardcoded list

const extractYoutubeThumbnail = (url: string) => {
  if (!url) return null;
  const youtubeRegex = /(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(youtubeRegex);
  if (match) {
    const videoId = match[1];
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  }
  return null;
};

export default function App() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentMember, setCurrentMember] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ texte: '', lien: '' });
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'alpha'>('recent');
  const [activeTab, setActiveTab] = useState<'poll' | 'repertoire' | 'rejected' | 'admin'>('poll');
  const [newMemberPseudo, setNewMemberPseudo] = useState('');
  const socketRef = useRef<WebSocket | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
  const [confirmingMemberRemove, setConfirmingMemberRemove] = useState<string | null>(null);

  const getScore = (questionId: number) => {
    let score = 0;
    const activeMemberPseudos = members.filter(m => m.active === 1).map(m => m.pseudo);
    votes.filter(v => activeMemberPseudos.includes(v.pseudo)).forEach(v => {
      const rep = v.reponses[questionId];
      if (rep === 'OK') score += 2;
      else if (rep === 'POURQUOI PAS') score += 1;
    });
    return score;
  };

  const sortedQuestions = [...questions].sort((a, b) => {
    if (sortBy === 'popular') {
      const scoreA = getScore(a.id);
      const scoreB = getScore(b.id);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.id - a.id; // Fallback to recent if scores are equal
    }
    if (sortBy === 'alpha') {
      return a.texte.localeCompare(b.texte);
    }
    return b.id - a.id; // Default: recent
  });

  useEffect(() => {
    fetchData();
    const socket = connectWebSocket();
    
    const savedMember = localStorage.getItem('poll_member');
    if (savedMember) {
      setCurrentMember(savedMember);
    }

    return () => {
      socket.close();
    };
  }, []);

  const fetchData = async () => {
    try {
      const [qRes, vRes, mRes] = await Promise.all([
        fetch('/api/questions'),
        fetch('/api/votes'),
        fetch('/api/members')
      ]);
      const qs = await qRes.json();
      const vs = await vRes.json();
      const ms = await mRes.json();
      setQuestions(qs);
      setVotes(vs);
      setMembers(ms);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch data', err);
    }
  };

  const connectWebSocket = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'QUESTION_ADDED') {
        setQuestions(prev => {
          if (prev.some(q => q.id === data.question.id)) return prev;
          return [...prev, data.question];
        });
      } else if (data.type === 'QUESTION_DELETED') {
        setQuestions(prev => prev.filter(q => q.id !== data.id));
      } else if (data.type === 'QUESTION_UPDATED') {
        setQuestions(prev => prev.map(q => q.id === data.question.id ? data.question : q));
      } else if (data.type === 'QUESTION_STATUS_UPDATED') {
        setQuestions(prev => prev.map(q => q.id === data.id ? { ...q, status: data.status } : q));
      } else if (data.type === 'VOTE_UPDATED') {
        setVotes(prev => {
          const filtered = prev.filter(v => v.pseudo !== data.vote.pseudo);
          return [...filtered, data.vote];
        });
      } else if (data.type === 'MEMBER_ADDED') {
        setMembers(prev => {
          const exists = prev.find(m => m.pseudo === data.member.pseudo);
          if (exists) return prev.map(m => m.pseudo === data.member.pseudo ? data.member : m);
          return [...prev, data.member];
        });
      } else if (data.type === 'MEMBER_UPDATED') {
        setMembers(prev => prev.map(m => m.pseudo === data.member.pseudo ? data.member : m));
        if (data.member.active === 0 && currentMember === data.member.pseudo) {
          setCurrentMember(null);
          localStorage.removeItem('poll_member');
        }
      } else if (data.type === 'MEMBER_REMOVED') {
        setMembers(prev => prev.filter(m => m.pseudo !== data.pseudo));
        setVotes(prev => prev.filter(v => v.pseudo !== data.pseudo));
        if (currentMember === data.pseudo) {
          setCurrentMember(null);
          localStorage.removeItem('poll_member');
        }
      }
    };

    socket.onclose = () => {
      setTimeout(connectWebSocket, 3000);
    };

    return socket;
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.texte) return;
    
    try {
      await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQuestion),
      });
      setNewQuestion({ texte: '', lien: '' });
      setIsAdding(false);
    } catch (err) {
      console.error('Failed to add question', err);
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    try {
      await fetch(`/api/questions/${id}`, { method: 'DELETE' });
      setConfirmingDelete(null);
    } catch (err) {
      console.error('Failed to delete question', err);
    }
  };

  const handleUpdateStatus = async (id: number, status: string) => {
    try {
      await fetch(`/api/questions/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.error('Failed to update status', err);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberPseudo.trim()) return;
    try {
      await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo: newMemberPseudo.trim() }),
      });
      setNewMemberPseudo('');
    } catch (err) {
      console.error('Failed to add member', err);
    }
  };

  const handleRemoveMember = async (pseudo: string) => {
    try {
      await fetch(`/api/members/${pseudo}`, { method: 'DELETE' });
      setConfirmingMemberRemove(null);
    } catch (err) {
      console.error('Failed to remove member', err);
    }
  };

  const handleReactivateMember = async (pseudo: string) => {
    try {
      await fetch(`/api/members/${pseudo}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });
    } catch (err) {
      console.error('Failed to reactivate member', err);
    }
  };
  const handleVote = async (questionId: number, status: VoteStatus) => {
    if (!currentMember) return;
    
    const myVote = votes.find(v => v.pseudo === currentMember);
    const newReponses = { ...(myVote?.reponses || {}), [questionId]: status as string };

    try {
      await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo: currentMember, reponses: newReponses }),
      });
    } catch (err) {
      console.error('Failed to vote', err);
    }
  };

  const getVoteStatus = (questionId: number, member: string): string | null => {
    const vote = votes.find(v => v.pseudo === member);
    return vote?.reponses[questionId] || null;
  };

  const selectMember = (member: string) => {
    setCurrentMember(member);
    localStorage.setItem('poll_member', member);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <header className="text-center mb-16">
        <div className="flex items-center justify-center gap-4 mb-4">
          <h1 className="text-5xl md:text-6xl font-display text-slate-800">
            Résultats du Sondage
          </h1>
          <span className="text-5xl">🎯</span>
        </div>
        <p className="text-slate-500 font-medium uppercase tracking-widest text-sm">
          Choisissez les prochains titres du groupe
        </p>
      </header>

      {/* Navigation Tabs */}
      <div className="flex justify-center mb-12 px-4">
        <div className="flex bg-slate-100 p-1 rounded-2xl shadow-inner overflow-x-auto no-scrollbar max-w-full">
          <button
            onClick={() => setActiveTab('poll')}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'poll' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <TrendingUp size={18} />
            Sondage
          </button>
          <button
            onClick={() => setActiveTab('repertoire')}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'repertoire' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <BookOpen size={18} />
            Répertoire
          </button>
          <button
            onClick={() => setActiveTab('rejected')}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'rejected' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <XCircle size={18} />
            Rejetés
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex items-center gap-2 px-4 sm:px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'admin' ? 'bg-white shadow-md text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Settings size={18} />
            Admin
          </button>
        </div>
      </div>

      {activeTab !== 'admin' && (
        <>
          {/* Member Selection */}
          <div className="mb-12 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-slate-400 mb-2">
              <Users size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">Qui vote ?</span>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {members.filter(m => m.active === 1).length > 0 ? (
                members.filter(m => m.active === 1).map(member => (
                  <button
                    key={member.pseudo}
                    onClick={() => selectMember(member.pseudo)}
                    className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
                      currentMember === member.pseudo
                        ? 'bg-slate-800 text-white shadow-lg scale-105'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {member.pseudo}
                  </button>
                ))
              ) : (
                <p className="text-slate-400 text-sm italic">Aucun membre actif. Allez dans Admin.</p>
              )}
            </div>
          </div>

          {!currentMember ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-20 text-center bg-white/50 rounded-[40px] border-2 border-dashed border-slate-200"
            >
              <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Users className="text-slate-400" size={40} />
              </div>
              <h3 className="text-2xl font-display text-slate-800 mb-3">Sélectionnez votre profil</h3>
              <p className="text-slate-500 max-w-sm mx-auto px-6">
                Choisissez qui vous êtes dans la liste ci-dessus pour accéder aux titres et pouvoir voter.
              </p>
            </motion.div>
          ) : (
            <>
              {/* Actions & Sorting */}
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar max-w-full">
              <button
                onClick={() => setSortBy('recent')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${sortBy === 'recent' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Clock size={16} />
                Récents
              </button>
              <button
                onClick={() => setSortBy('popular')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${sortBy === 'popular' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <TrendingUp size={16} />
                Populaires
              </button>
              <button
                onClick={() => setSortBy('alpha')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${sortBy === 'alpha' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <SortAsc size={16} />
                A-Z
              </button>
            </div>
            
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-slate-700 transition-colors shadow-sm"
            >
              <Plus size={20} />
              Ajouter un titre
            </button>
          </div>

          {/* Song Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <AnimatePresence mode="popLayout">
              {sortedQuestions
                .filter(q => {
                  const status = q.status || 'active';
                  if (activeTab === 'poll') return status === 'active';
                  if (activeTab === 'repertoire') return status === 'validated';
                  if (activeTab === 'rejected') return status === 'rejected';
                  return false;
                }).length === 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="col-span-full py-20 text-center"
                  >
                    <Music className="mx-auto text-slate-200 mb-4" size={48} />
                    <p className="text-slate-400 italic">Aucun titre dans cette catégorie.</p>
                  </motion.div>
                )}
              {sortedQuestions
                .filter(q => {
                  const status = q.status || 'active';
                  if (activeTab === 'poll') return status === 'active';
                  if (activeTab === 'repertoire') return status === 'validated';
                  if (activeTab === 'rejected') return status === 'rejected';
                  return false;
                })
                .map((q, index) => {
                const thumb = extractYoutubeThumbnail(q.lien) || `https://picsum.photos/seed/${encodeURIComponent(q.texte)}/400/300`;
                const score = getScore(q.id);
                return (
                  <motion.div
                    key={q.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col relative"
                  >
                    {sortBy === 'popular' && index < 3 && activeTab === 'poll' && (
                      <div className="absolute top-3 left-3 z-10 bg-amber-400 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-md">
                        <Trophy size={12} />
                        #{index + 1}
                      </div>
                    )}
                    <div className="relative aspect-video overflow-hidden group">
                      <img
                        src={thumb}
                        alt={q.texte}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                      
                      {/* Admin/Quick Actions */}
                      <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {confirmingDelete === q.id ? (
                          <div className="flex gap-1 bg-white p-1 rounded-full shadow-lg border border-rose-100">
                            <button
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="p-1.5 bg-rose-500 text-white rounded-full hover:bg-rose-600"
                              title="Confirmer la suppression"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setConfirmingDelete(null)}
                              className="p-1.5 bg-slate-100 text-slate-400 rounded-full hover:bg-slate-200"
                              title="Annuler"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <>
                            {q.status === 'active' && (
                              <>
                                <button
                                  onClick={() => handleUpdateStatus(q.id, 'validated')}
                                  className="p-2 bg-emerald-500 text-white rounded-full hover:bg-emerald-600 shadow-lg"
                                  title="Valider (ajouter au répertoire)"
                                >
                                  <CheckCircle2 size={18} />
                                </button>
                                <button
                                  onClick={() => handleUpdateStatus(q.id, 'rejected')}
                                  className="p-2 bg-rose-500 text-white rounded-full hover:bg-rose-600 shadow-lg"
                                  title="Rejeter"
                                >
                                  <XCircle size={18} />
                                </button>
                              </>
                            )}
                            {(q.status === 'validated' || q.status === 'rejected') && (
                              <button
                                onClick={() => handleUpdateStatus(q.id, 'active')}
                                className="p-2 bg-slate-500 text-white rounded-full hover:bg-slate-600 shadow-lg"
                                title="Remettre en sondage"
                              >
                                <Archive size={18} />
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmingDelete(q.id)}
                              className="p-2 bg-white text-rose-500 rounded-full hover:bg-rose-50 shadow-lg"
                              title="Supprimer définitivement"
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>

                      {q.lien && (
                        <a
                          href={q.lien}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute bottom-3 right-3 p-2 bg-white/90 backdrop-blur-sm rounded-full text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-50"
                        >
                          <ExternalLink size={18} />
                        </a>
                      )}
                    </div>
                    
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="mb-6 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-xl font-bold text-slate-800 leading-tight mb-1">{q.texte}</h3>
                          {q.status !== 'active' && (
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              q.status === 'validated' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                            }`}>
                              {q.status === 'validated' ? 'Répertoire' : 'Rejeté'}
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 flex flex-col items-center min-w-[40px]">
                          <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Score</span>
                          <span className="text-sm font-bold text-slate-700 leading-none">{score}</span>
                        </div>
                      </div>

                      {/* Votes Display */}
                      <div className="grid grid-cols-3 gap-2 mb-6">
                        {members.map(member => {
                          const status = getVoteStatus(q.id, member.pseudo);
                          const isCurrent = currentMember === member.pseudo;
                          const isGhost = member.active === 0;
                          
                          if (isGhost && !status) return null; // Don't show ghosts who didn't vote

                          return (
                            <div
                              key={member.pseudo}
                              className={`relative p-2 rounded-lg text-center transition-all ${
                                status === 'OK' ? 'bg-emerald-500 text-white' :
                                status === 'POURQUOI PAS' ? 'bg-amber-400 text-white' :
                                status === 'KO' ? 'bg-rose-500 text-white' :
                                'bg-slate-50 text-slate-400'
                              } ${isCurrent ? 'ring-2 ring-slate-800 ring-offset-2' : ''} ${isGhost ? 'opacity-40 grayscale-[0.5]' : ''}`}
                              title={isGhost ? `${member.pseudo} (Fantôme)` : member.pseudo}
                            >
                              <span className="text-xs font-bold block truncate">
                                {member.pseudo} {
                                  status === 'OK' ? '🤘' : 
                                  status === 'POURQUOI PAS' ? '🤔' : 
                                  status === 'KO' ? '❌' : 
                                  (status && status !== 'Pas de réponse' ? `(${status})` : '')
                                }
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Voting Controls */}
                      {currentMember && q.status === 'active' && (
                        <div className="mt-auto pt-4 border-t border-slate-50 flex justify-center gap-3">
                          <button
                            onClick={() => handleVote(q.id, 'OK')}
                            className={`p-3 rounded-xl transition-all ${getVoteStatus(q.id, currentMember) === 'OK' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600'}`}
                            title="OK"
                          >
                            <Check size={20} />
                          </button>
                          <button
                            onClick={() => handleVote(q.id, 'POURQUOI PAS')}
                            className={`p-3 rounded-xl transition-all ${getVoteStatus(q.id, currentMember) === 'POURQUOI PAS' ? 'bg-amber-500 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-amber-50 hover:text-amber-600'}`}
                            title="POURQUOI PAS"
                          >
                            <HelpCircle size={20} />
                          </button>
                          <button
                            onClick={() => handleVote(q.id, 'KO')}
                            className={`p-3 rounded-xl transition-all ${getVoteStatus(q.id, currentMember) === 'KO' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-600'}`}
                            title="KO"
                          >
                            <X size={20} />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}
    </>
  )}

      {activeTab === 'admin' && (
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm">
            <h2 className="text-2xl font-display text-slate-800 mb-6 flex items-center gap-2">
              <Users className="text-slate-400" />
              Gestion des membres
            </h2>
            
            <form onSubmit={handleAddMember} className="flex gap-3 mb-8">
              <input
                type="text"
                value={newMemberPseudo}
                onChange={e => setNewMemberPseudo(e.target.value)}
                placeholder="Nouveau pseudo..."
                className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-slate-800 transition-all"
              />
              <button
                type="submit"
                className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all flex items-center gap-2"
              >
                <UserPlus size={20} />
                Ajouter
              </button>
            </form>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Membres Actifs</h3>
              {members.filter(m => m.active === 1).map(member => (
                <div key={member.pseudo} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-slate-400 border border-slate-200">
                      {member.pseudo[0]}
                    </div>
                    <span className="font-bold text-slate-700">{member.pseudo}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {confirmingMemberRemove === member.pseudo ? (
                      <div className="flex gap-1 bg-white p-1 rounded-xl shadow-sm border border-rose-100">
                        <button
                          onClick={() => handleRemoveMember(member.pseudo)}
                          className="px-3 py-1 bg-rose-500 text-white text-xs font-bold rounded-lg hover:bg-rose-600"
                        >
                          Confirmer
                        </button>
                        <button
                          onClick={() => setConfirmingMemberRemove(null)}
                          className="px-3 py-1 bg-slate-100 text-slate-400 text-xs font-bold rounded-lg hover:bg-slate-200"
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmingMemberRemove(member.pseudo)}
                        className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl transition-all"
                        title="Passer en mode fantôme"
                      >
                        <UserMinus size={20} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {members.filter(m => m.active === 0).length > 0 && (
                <>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mt-8 mb-2">Membres Fantômes</h3>
                  {members.filter(m => m.active === 0).map(member => (
                    <div key={member.pseudo} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      <div className="flex items-center gap-3 opacity-50">
                        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-bold text-slate-300 border border-slate-100">
                          {member.pseudo[0]}
                        </div>
                        <span className="font-bold text-slate-500 italic">{member.pseudo}</span>
                      </div>
                      <button
                        onClick={() => handleReactivateMember(member.pseudo)}
                        className="p-2 text-emerald-400 hover:bg-emerald-50 rounded-xl transition-all"
                        title="Réactiver le membre"
                      >
                        <UserPlus size={20} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="bg-slate-50 p-8 rounded-3xl border border-dashed border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 mb-2">Titres rejetés</h3>
            <p className="text-sm text-slate-500 mb-6">Ces titres ont été sortis du sondage sans être validés.</p>
            <div className="space-y-2">
              {questions.filter(q => (q.status || 'active') === 'rejected').map(q => (
                <div key={q.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                  <span className="font-medium text-slate-600">{q.texte}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateStatus(q.id, 'active')}
                      className="text-xs font-bold text-slate-400 hover:text-slate-800 uppercase tracking-wider"
                    >
                      Réactiver
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="text-rose-400 hover:text-rose-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {questions.filter(q => (q.status || 'active') === 'rejected').length === 0 && (
                <div className="text-center py-4 text-slate-400 text-sm italic">Aucun titre rejeté</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Song Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 overflow-hidden"
            >
              <h2 className="text-2xl font-display text-slate-800 mb-6">Ajouter un nouveau titre</h2>
              <form onSubmit={handleAddQuestion} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Titre / Artiste</label>
                  <input
                    autoFocus
                    required
                    type="text"
                    value={newQuestion.texte}
                    onChange={e => setNewQuestion(prev => ({ ...prev, texte: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-slate-800 transition-all"
                    placeholder="ex: Niagara - J'ai vu"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Lien (YouTube, etc.)</label>
                  <input
                    type="url"
                    value={newQuestion.lien}
                    onChange={e => setNewQuestion(prev => ({ ...prev, lien: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border-none focus:ring-2 focus:ring-slate-800 transition-all"
                    placeholder="https://..."
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 px-6 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 rounded-xl font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-colors shadow-lg shadow-slate-200"
                  >
                    Ajouter
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="mt-24 text-center text-slate-400 text-xs font-bold uppercase tracking-[0.2em]">
        <div className="flex items-center justify-center gap-2">
          <Music size={14} />
          <span>Sondage Titres Groupe • {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
