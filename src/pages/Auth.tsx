
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';

const Auth = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                navigate('/');
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            username,
                        },
                    },
                });
                if (error) throw error;
                alert('Check your email for the confirmation link!');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-4">
            <div className="w-full max-w-sm space-y-8">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-green-400">PadelUp</h1>
                    <p className="mt-2 text-slate-400">
                        {isLogin ? 'Welcome back, Champion' : 'Join the Club'}
                    </p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-slate-400">Username</label>
                            <input
                                type="text"
                                required
                                className="mt-1 block w-full rounded-lg bg-slate-800 border-transparent focus:border-green-500 focus:bg-slate-700 focus:ring-0 text-white p-3 transition-colors"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-400">Email</label>
                        <input
                            type="email"
                            required
                            className="mt-1 block w-full rounded-lg bg-slate-800 border-transparent focus:border-green-500 focus:bg-slate-700 focus:ring-0 text-white p-3 transition-colors"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400">Password</label>
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full rounded-lg bg-slate-800 border-transparent focus:border-green-500 focus:bg-slate-700 focus:ring-0 text-white p-3 transition-colors"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="w-full" isLoading={loading}>
                        {isLogin ? 'Sign In' : 'Create Account'}
                    </Button>

                    <div className="text-center">
                        <button
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-sm text-slate-500 hover:text-green-400 transition-colors"
                        >
                            {isLogin ? "Don't have an account? Sign Up" : 'Already have an account? Sign In'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Auth;
