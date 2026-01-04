import { ArrowLeft, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LEVELS } from '../lib/elo';

const Levels = () => {
    return (
        <div className="space-y-6 animate-fade-in relative z-10 pb-20">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link to="/" className="p-2 rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">ELO Levels</h1>
                    <p className="text-slate-400 text-sm">Understand the ranking system</p>
                </div>
            </div>

            {/* Levels List */}
            <div className="grid gap-4">
                {LEVELS.map((level, index) => {
                    const isTopLevel = level.level >= 5;
                    const isAdvanced = level.level >= 4 && level.level < 5;
                    const isIntermediate = level.level >= 3 && level.level < 4;

                    return (
                        <div key={index} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 border border-slate-700/50 shadow-lg">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-bold text-xl shadow-inner ${isTopLevel ? 'bg-yellow-500/20 text-yellow-500 ring-1 ring-yellow-500/50' :
                                            isAdvanced ? 'bg-purple-500/20 text-purple-500 ring-1 ring-purple-500/50' :
                                                isIntermediate ? 'bg-blue-500/20 text-blue-500 ring-1 ring-blue-500/50' :
                                                    'bg-slate-700/50 text-slate-400 ring-1 ring-slate-600/50'
                                        }`}>
                                        {level.level}
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white leading-tight">{level.label}</h3>
                                        <p className="text-sm font-medium text-slate-400 mt-1">
                                            {level.min} - {level.max >= 9999 ? '∞' : level.max} pts
                                        </p>
                                    </div>
                                </div>
                                {isTopLevel && <Trophy className="text-yellow-500 opacity-20 absolute -right-2 -bottom-2 transform rotate-12" size={64} />}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default Levels;
