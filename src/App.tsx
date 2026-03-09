/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Music, Users, Check, X, HelpCircle, Loader2, ExternalLink, TrendingUp, Clock, SortAsc, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type VoteStatus = 'OK' | 'POURQUOI PAS' | 'KO' | null;

interface Question {
  id: number;
  texte: string;
  lien: string;
}

interface Vote {
  pseudo: string;
  reponses: Record<number, string>;
}

const MEMBERS = ['Vanessa', 'Laurent', 'Stéph', 'Pierre', 'Eric'];

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
  const [currentMember, setCurrentMember] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ texte: '', lien: '' });
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'alpha'>('recent');
  const socketRef = useRef<WebSocket | null>(null);

  const getScore = (questionId: number) => {
    let score = 0;
    votes.forEach(v => {
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
    connectWebSocket();
    
    const savedMember = localStorage.getItem('poll_member');
    if (savedMember && MEMBERS.includes(savedMember)) {
      setCurrentMember(savedMember);
    }

    return () => {
      socketRef.current?.close();
    };
  }, []);

  const fetchData = async () => {
    try {
      const [qRes, vRes] = await Promise.all([
        fetch('/api/questions'),
        fetch('/api/votes')
      ]);
      const qs = await qRes.json();
      const vs = await vRes.json();
      setQuestions(qs);
      setVotes(vs);
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
        setQuestions(prev => [...prev, data.question]);
      } else if (data.type === 'QUESTION_DELETED') {
        setQuestions(prev => prev.filter(q => q.id !== data.id));
      } else if (data.type === 'VOTE_UPDATED') {
        setVotes(prev => {
          const filtered = prev.filter(v => v.pseudo !== data.vote.pseudo);
          return [...filtered, data.vote];
        });
      }
    };

    socket.onclose = () => {
      setTimeout(connectWebSocket, 3000);
    };
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
    if (!window.confirm('Supprimer ce titre ?')) return;
    try {
      await fetch(`/api/questions/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete question', err);
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

      {/* Member Selection */}
      <div className="mb-12 flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 text-slate-400 mb-2">
          <Users size={18} />
          <span className="text-xs font-bold uppercase tracking-wider">Qui vote ?</span>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          {MEMBERS.map(member => (
            <button
              key={member}
              onClick={() => selectMember(member)}
              className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
                currentMember === member
                  ? 'bg-slate-800 text-white shadow-lg scale-105'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-400'
              }`}
            >
              {member}
            </button>
          ))}
        </div>
      </div>

      {/* Actions & Sorting */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setSortBy('recent')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${sortBy === 'recent' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Clock size={16} />
            Récents
          </button>
          <button
            onClick={() => setSortBy('popular')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${sortBy === 'popular' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <TrendingUp size={16} />
            Populaires
          </button>
          <button
            onClick={() => setSortBy('alpha')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${sortBy === 'alpha' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
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
          {sortedQuestions.map((q, index) => {
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
                {sortBy === 'popular' && index < 3 && (
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
                  <button
                    onClick={() => handleDeleteQuestion(q.id)}
                    className="absolute top-3 right-3 p-2 bg-white/90 backdrop-blur-sm rounded-full text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-50"
                  >
                    <Trash2 size={18} />
                  </button>
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
                    <h3 className="text-xl font-bold text-slate-800 leading-tight">{q.texte}</h3>
                    <div className="shrink-0 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 flex flex-col items-center min-w-[40px]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">Score</span>
                      <span className="text-sm font-bold text-slate-700 leading-none">{score}</span>
                    </div>
                  </div>

                  {/* Votes Display */}
                  <div className="grid grid-cols-3 gap-2 mb-6">
                    {MEMBERS.map(member => {
                      const status = getVoteStatus(q.id, member);
                      const isCurrent = currentMember === member;
                      
                      return (
                        <div
                          key={member}
                          className={`relative p-2 rounded-lg text-center transition-all ${
                            status === 'OK' ? 'bg-emerald-500 text-white' :
                            status === 'POURQUOI PAS' ? 'bg-amber-400 text-white' :
                            status === 'KO' ? 'bg-rose-500 text-white' :
                            'bg-slate-50 text-slate-400'
                          } ${isCurrent ? 'ring-2 ring-slate-800 ring-offset-2' : ''}`}
                        >
                          <span className="text-xs font-bold block truncate">
                            {member} {
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
                  {currentMember && (
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
