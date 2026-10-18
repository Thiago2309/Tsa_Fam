'use client';

import React from 'react';
import { Sidebar } from 'primereact/sidebar';
import { Combustible } from '../../../Services/BD/combustibleService';
import FotoZoom from './FotoZoom';

interface CombustibleVistaSidebarProps {
    combustible: Combustible | null;
    onHide: () => void;
}

const FotoBloque = ({ label, url }: { label: string; url?: string | null }) => (
    <div className="mb-3">
        <div className="text-500 text-sm mb-1">{label}</div>
        {url ? <FotoZoom src={url} alt={label} /> : <div className="text-sm text-500">Sin foto</div>}
    </div>
);

const CombustibleVistaSidebar = ({ combustible, onHide }: CombustibleVistaSidebarProps) => {
    const formatearMoneda = (v: number | null | undefined) => (v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

    const formatearHora = (iso?: string | null) =>
        iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Cancun' }) : '-';

    const unidad = combustible
        ? combustible.tipo_equipo === 'camion'
            ? `${combustible.camion_nombre || ''} ${combustible.camion_placa ? `(${combustible.camion_placa})` : ''}`
            : `${combustible.maquinaria_eco ? `${combustible.maquinaria_eco} - ` : ''}${combustible.maquinaria_equipo || ''}`
        : '';

    return (
        <Sidebar visible={!!combustible} onHide={onHide} position="left" style={{ width: '380px' }}>
            {combustible && (
                <div>
                    <h4 className="mt-0">Registro de Combustible</h4>
                    <p className="text-500 mt-0">{new Date(combustible.fecha + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>

                    <div className="border-1 surface-border border-round p-3 mb-3">
                        <div className="text-sm text-500 mb-1">Tipo</div>
                        <div className="font-medium mb-2">{combustible.tipo_equipo === 'camion' ? 'Camión' : 'Maquinaria'}</div>

                        <div className="text-sm text-500 mb-1">Unidad</div>
                        <div className="font-medium mb-2">{unidad}</div>

                        <div className="text-sm text-500 mb-1">Operador</div>
                        <div className="font-medium mb-2">{combustible.operador_nombre || '-'}</div>

                        <div className="text-sm text-500 mb-1">{combustible.tipo_equipo === 'camion' ? 'Kilometraje' : 'Horómetro'}</div>
                        <div className="font-medium mb-2">
                            {combustible.tipo_equipo === 'camion'
                                ? combustible.kilometraje != null ? `${combustible.kilometraje} km` : '-'
                                : combustible.horometro != null ? `${combustible.horometro} hrs` : '-'}
                        </div>

                        <div className="text-sm text-500 mb-1">Precio por litro</div>
                        <div className="font-medium mb-2">{combustible.precio_unitario != null ? formatearMoneda(combustible.precio_unitario) : '-'}</div>

                        <div className="text-sm text-500 mb-1">Litros</div>
                        <div className="font-medium mb-2">{combustible.litros ?? '-'}</div>

                        <div className="text-sm text-500 mb-1">Importe</div>
                        <div className="font-bold">{formatearMoneda(combustible.importe)}</div>
                    </div>

                    <div className="border-1 surface-border border-round p-3 mb-3">
                        <div className="text-sm text-500 mb-1">Hora de captura</div>
                        <div className="font-medium mb-2">{formatearHora(combustible.hora_captura)}</div>

                        {combustible.latitud != null && combustible.longitud != null ? (
                            <>
                                <div className="text-sm text-500 mb-1">Ubicación</div>
                                <div className="font-medium mb-1">
                                    {combustible.latitud.toFixed(5)}, {combustible.longitud.toFixed(5)}
                                </div>
                                <a href={`https://www.google.com/maps?q=${combustible.latitud},${combustible.longitud}`} target="_blank" rel="noreferrer" className="text-sm text-primary block">
                                    Ver en mapa
                                </a>
                            </>
                        ) : (
                            <div className="text-sm text-500">Ubicación no disponible</div>
                        )}
                    </div>

                    <h5 className="mb-2">Evidencia fotográfica</h5>
                    <FotoBloque label="Indicador de combustible (antes de cargar)" url={combustible.foto_indicador_antes_url} />
                    <FotoBloque label="Bomba de combustible" url={combustible.foto_bomba_url} />
                    <FotoBloque label="Indicador de combustible (después de cargar)" url={combustible.foto_indicador_despues_url} />
                </div>
            )}
        </Sidebar>
    );
};

export default CombustibleVistaSidebar;
