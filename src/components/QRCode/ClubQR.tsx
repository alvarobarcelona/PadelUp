
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface ClubQRProps {
    url?: string;
    size?: number;
}

const ClubQR: React.FC<ClubQRProps> = ({ url, size = 200 }) => {
    const finalUrl = url || window.location.href;

    return (
        <div className="flex flex-col items-center gap-4 bg-white/5 p-6 rounded-2xl border border-white/10">
            <div className="bg-white p-4 rounded-xl">
                <QRCodeSVG
                    value={finalUrl}
                    size={size}
                    level="H"
                    includeMargin={true}
                />
            </div>
            <p className="text-slate-400 text-sm text-center">
                Scan to join the club
            </p>
        </div>
    );
};

export default ClubQR;
