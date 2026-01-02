import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

const Auth = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [isLogin, setIsLogin] = useState(true);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const getFriendlyErrorMessage = (msg: string) => {
        if (msg.includes('Invalid login credentials')) return 'Incorrect email or password.';
        if (msg.includes('Password should be at least')) return 'Password is too short (min 6 chars).';
        if (msg.includes('User already registered')) return 'This email is already registered.';
        return msg;
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data: profileCheck, error: profileCheckError } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', email)
                .single();

            if (profileCheckError || !profileCheck) {

                if (profileCheckError?.code === 'PGRST116' || !profileCheck) {
                    throw new Error('Email not found in our records.');
                }

            }


            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password', // or just root
            });
            if (error) throw error;
            alert('Password reset link sent! Check your email.');
            setIsForgotPassword(false);
            setIsLogin(true);
        } catch (err: any) {
            setError(getFriendlyErrorMessage(err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isForgotPassword) {
            await handleResetPassword(e);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            if (isLogin) {
                // Pre-check for email existence to provide specific error message
                const { data: userExists } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('email', email)
                    .maybeSingle();

                if (!userExists) {
                    throw new Error('Email not found. Please sign up first.');
                }

                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) {
                    // Since email exists, this is likely a password error
                    if (error.message.includes('Invalid login credentials')) {
                        throw new Error('Incorrect password.');
                    }
                    throw error;
                }
                navigate('/');
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;

                const { error: updateError } = await supabase.auth.updateUser({
                    data: { username }
                });
                if (updateError) console.error("Error saving username meta", updateError);


                alert('Success! Check your email for the confirmation link!');
            }
        } catch (err: any) {
            setError(getFriendlyErrorMessage(err.message));
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
                        {isForgotPassword ? 'Reset Password' : (isLogin ? 'Welcome back, Champion' : 'Join the Club')}
                    </p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                    {!isLogin && !isForgotPassword && (
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

                    {/* Password Field - Hide in Forgot Password Mode */}
                    {!isForgotPassword && (
                        <div>
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-slate-400">Password</label>
                                {isLogin && (
                                    <button
                                        type="button"
                                        onClick={() => setIsForgotPassword(true)}
                                        className="text-xs text-green-400 hover:text-green-300"
                                    >
                                        Forgot?
                                    </button>
                                )}
                            </div>
                            <div className="relative mt-1">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required={!isForgotPassword}
                                    className="block w-full rounded-lg bg-slate-800 border-transparent focus:border-green-500 focus:bg-slate-700 focus:ring-0 text-white p-3 pr-10 transition-colors"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="w-full" isLoading={loading}>
                        {isForgotPassword ? 'Send Reset Link' : (isLogin ? 'Sign In' : 'Create Account')}
                    </Button>

                    {isForgotPassword && (
                        <div className="text-center mt-2">
                            <button
                                type="button"
                                onClick={() => setIsForgotPassword(false)}
                                className="text-sm text-slate-500 hover:text-white transition-colors"
                            >
                                Back to Login
                            </button>
                        </div>
                    )}

                    <div className="text-center">
                        <button
                            type="button"
                            onClick={() => {
                                setIsLogin(!isLogin);
                                setIsForgotPassword(false);
                            }}
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
