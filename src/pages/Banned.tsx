import { ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';

const Banned = () => {
    const navigate = useNavigate();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/auth');
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-4 text-center">
            <div className="bg-red-500/10 p-6 rounded-full mb-6 animate-pulse">
                <ShieldAlert size={64} className="text-red-500" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Account temporarily suspended</h1>
            <p className="text-slate-400 mb-8 max-w-xs">
                Your account has been blocked for several possible reasons: <br />
                -Attempt to cheat the system <br />
                -Symbolic non-payment to help the community <br />
                -Mismanagement <br />
                Please contact an administrator or send your case to support in the settings area.
            </p>
            <Button onClick={handleLogout} variant="danger" className="w-full max-w-xs">
                Sign Out
            </Button>
        </div>
    );
};

export default Banned;
