'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { InputNumber } from 'primereact/inputnumber';
import { Toast } from 'primereact/toast';
import { Combustible, TipoUnidadCombustible, createCombustible, subirFotoCombustible } from '../../../Services/BD/combustibleService';
import { Camion } from '../../../Services/BD/inventario/camion/camionService';
import { Maquinaria } from '../../../Services/BD/inventario/maquinaria/maquinariaService';
import { obtenerUbicacionActual } from '../../../Services/BD/Checador/checadorService';
import InputLitros from './InputLitros';
import FotoZoom from './FotoZoom';

const tipoOptions = [
    { label: 'Camión', value: 'camion' },
    { label: 'Maquinaria', value: 'maquinaria' }
];

type FotoState = { blob: Blob | null; preview: string | null };
const fotoVacia: FotoState = { blob: null, preview: null };

interface CapturaFotoProps {
    label: string;
    value: FotoState;
    onChange: (foto: FotoState) => void;
    toast: React.RefObject<Toast>;
}

// Captura de foto con la cámara trasera del dispositivo, con vista previa embebida en el diálogo.
// Reutiliza el mismo patrón (getUserMedia + canvas.toBlob) que ChecadorEmpleado.tsx, pero sin espejo
// (aquí se fotografía el tablero/bomba, no una selfie).
const CapturaFoto = ({ label, value, onChange, toast }: CapturaFotoProps) => {
    const [camaraAbierta, setCamaraAbierta] = useState(false);
    const [camaraLista, setCamaraLista] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const detenerCamara = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    };

    useEffect(() => {
        if (!camaraAbierta) return;

        let cancelado = false;
        (async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
                if (cancelado) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                const video = videoRef.current;
                if (!video) return;
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    video.play().catch((err) => console.error('Error reproduciendo video:', err));
                    setCamaraLista(true);
                };
            } catch (error) {
                console.error('Error abriendo cámara:', error);
                if (cancelado) return;
                toast.current?.show({ severity: 'error', summary: 'Cámara requerida', detail: 'No se pudo acceder a la cámara. Revisa los permisos del navegador.', life: 5000 });
                setCamaraAbierta(false);
            }
        })();

        return () => {
            cancelado = true;
            detenerCamara();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [camaraAbierta]);

    const capturar = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !video.videoWidth) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
            (blob) => {
                if (blob) {
                    detenerCamara();
                    setCamaraAbierta(false);
                    setCamaraLista(false);
                    onChange({ blob, preview: URL.createObjectURL(blob) });
                }
            },
            'image/jpeg',
            0.85
        );
    };

    const retomar = () => {
        onChange(fotoVacia);
        setCamaraAbierta(true);
    };

    return (
        <div className="field">
            <label>{label} <span style={{ color: 'red' }}>*</span></label>

            {!camaraAbierta && !value.preview && (
                <Button type="button" label="Abrir cámara" icon="pi pi-camera" outlined className="w-full" onClick={() => setCamaraAbierta(true)} />
            )}

            {camaraAbierta && (
                <div className="flex flex-column align-items-center gap-2">
                    <div className="w-full relative">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full border-round" style={{ backgroundColor: '#000', minHeight: '220px' }} />
                        {!camaraLista && (
                            <div className="absolute top-0 left-0 w-full h-full flex align-items-center justify-content-center text-white">
                                <i className="pi pi-spin pi-spinner mr-2" /> Iniciando cámara...
                            </div>
                        )}
                    </div>
                    <Button type="button" label="Capturar Foto" icon="pi pi-camera" className="w-full" onClick={capturar} disabled={!camaraLista} />
                </div>
            )}

            {!camaraAbierta && value.preview && (
                <div className="flex flex-column align-items-center gap-2">
                    <FotoZoom src={value.preview} alt={label} />
                    <Button type="button" label="Retomar foto" icon="pi pi-replay" severity="secondary" outlined className="w-full" onClick={retomar} />
                </div>
            )}

            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    );
};

interface CombustibleWizardDialogProps {
    visible: boolean;
    onHide: () => void;
    onGuardado: () => void;
    camiones: Camion[];
    maquinarias: Maquinaria[];
    operadores: { id: number; nombre: string }[];
}

const camposVacios: Omit<Combustible, 'id'> = {
    fecha: '',
    tipo_equipo: null,
    camion_id: null,
    maquinaria_id: null,
    id_operador: null,
    kilometraje: null,
    horometro: null,
    precio_unitario: null,
    litros: null,
    importe: null
};

const CombustibleWizardDialog = ({ visible, onHide, onGuardado, camiones, maquinarias, operadores }: CombustibleWizardDialogProps) => {
    const [fase, setFase] = useState<1 | 2 | 3>(1);
    const [combustible, setCombustible] = useState<Omit<Combustible, 'id'>>(camposVacios);
    const [fotoAntes, setFotoAntes] = useState<FotoState>(fotoVacia);
    const [fotoBomba, setFotoBomba] = useState<FotoState>(fotoVacia);
    const [fotoDespues, setFotoDespues] = useState<FotoState>(fotoVacia);
    const [guardando, setGuardando] = useState(false);
    const toast = useRef<Toast>(null);

    const resetear = () => {
        setFase(1);
        setCombustible(camposVacios);
        setFotoAntes(fotoVacia);
        setFotoBomba(fotoVacia);
        setFotoDespues(fotoVacia);
        setGuardando(false);
    };

    const cerrar = () => {
        resetear();
        onHide();
    };

    const cambiarTipo = (tipo: TipoUnidadCombustible) => {
        setCombustible({
            ...combustible,
            tipo_equipo: tipo,
            camion_id: null,
            maquinaria_id: null,
            kilometraje: tipo === 'camion' ? combustible.kilometraje : null,
            horometro: tipo === 'maquinaria' ? combustible.horometro : null
        });
    };

    const unidadValida = combustible.tipo_equipo === 'camion' ? !!combustible.camion_id : combustible.tipo_equipo === 'maquinaria' ? !!combustible.maquinaria_id : false;
    const fase1Valida = !!combustible.fecha && !!combustible.tipo_equipo && unidadValida && combustible.id_operador !== null && !!fotoAntes.blob;
    const fase2Valida = !!fotoBomba.blob && !!fotoDespues.blob;
    const fase3Valida = !!combustible.precio_unitario && !!combustible.litros && !!combustible.importe;

    const unidadOptions = combustible.tipo_equipo === 'camion'
        ? camiones.map((c) => ({ label: `${c.nombre} (${c.placa})`, value: c.id }))
        : maquinarias.map((m) => ({ label: `${m.eco} - ${m.equipo}`, value: m.id }));

    const guardar = async () => {
        if (!fase3Valida) return;
        setGuardando(true);

        try {
            const ubicacion = await obtenerUbicacionActual();

            const idOperador = combustible.id_operador!;
            const [fotoAntesUrl, fotoBombaUrl, fotoDespuesUrl] = await Promise.all([
                subirFotoCombustible(idOperador, 'antes', fotoAntes.blob!),
                subirFotoCombustible(idOperador, 'bomba', fotoBomba.blob!),
                subirFotoCombustible(idOperador, 'despues', fotoDespues.blob!)
            ]);

            await createCombustible({
                ...combustible,
                foto_indicador_antes_url: fotoAntesUrl,
                foto_bomba_url: fotoBombaUrl,
                foto_indicador_despues_url: fotoDespuesUrl,
                latitud: ubicacion.latitud,
                longitud: ubicacion.longitud,
                precision_metros: ubicacion.precision_metros,
                hora_captura: new Date().toISOString()
            });

            toast.current?.show({ severity: 'success', summary: 'Éxito', detail: 'Combustible creado', life: 3000 });
            onGuardado();
            cerrar();
        } catch (error: any) {
            console.error('Error guardando combustible:', error);
            toast.current?.show({ severity: 'error', summary: 'Error', detail: error.message || 'No se pudo guardar el registro', life: 4000 });
            setGuardando(false);
        }
    };

    const footer = (
        <>
            {fase === 1 && <Button label="Cancelar" icon="pi pi-times" text onClick={cerrar} />}
            {fase > 1 && <Button label="Atrás" icon="pi pi-arrow-left" text onClick={() => setFase((f) => (f - 1) as 1 | 2 | 3)} disabled={guardando} />}
            {fase < 3 && (
                <Button
                    label="Siguiente"
                    icon="pi pi-arrow-right"
                    iconPos="right"
                    onClick={() => setFase((f) => (f + 1) as 1 | 2 | 3)}
                    disabled={(fase === 1 && !fase1Valida) || (fase === 2 && !fase2Valida)}
                />
            )}
            {fase === 3 && <Button label="Guardar" icon="pi pi-check" onClick={guardar} loading={guardando} disabled={!fase3Valida} />}
        </>
    );

    return (
        <Dialog
            visible={visible}
            style={{ width: '550px' }}
            header={`Registro de Combustible — Fase ${fase} de 3`}
            modal
            className="p-fluid"
            footer={footer}
            closable={!guardando}
            onHide={cerrar}
        >
            <Toast ref={toast} />

            {fase === 1 && (
                <>
                    <div className="field">
                        <label htmlFor="fecha">Fecha <span style={{ color: 'red' }}>*</span></label>
                        <Calendar
                            id="fecha"
                            value={combustible.fecha ? (() => { const [y, m, d] = combustible.fecha.split('-').map(Number); return new Date(y, m - 1, d); })() : null}
                            onChange={(e) => setCombustible({ ...combustible, fecha: e.value ? `${e.value.getFullYear()}-${String(e.value.getMonth() + 1).padStart(2, '0')}-${String(e.value.getDate()).padStart(2, '0')}` : '' })}
                            dateFormat="yy-mm-dd"
                            showIcon
                        />
                    </div>

                    <div className="grid">
                        <div className="col-6">
                            <div className="field">
                                <label htmlFor="tipo_equipo">Tipo <span style={{ color: 'red' }}>*</span></label>
                                <Dropdown id="tipo_equipo" value={combustible.tipo_equipo} options={tipoOptions} onChange={(e) => cambiarTipo(e.value)} placeholder="Camión o Maquinaria" />
                            </div>
                        </div>
                        <div className="col-6">
                            <div className="field">
                                <label htmlFor="unidad">Unidad <span style={{ color: 'red' }}>*</span></label>
                                <Dropdown
                                    id="unidad"
                                    value={combustible.tipo_equipo === 'camion' ? combustible.camion_id : combustible.maquinaria_id}
                                    options={unidadOptions}
                                    onChange={(e) => setCombustible(combustible.tipo_equipo === 'camion' ? { ...combustible, camion_id: e.value } : { ...combustible, maquinaria_id: e.value })}
                                    placeholder={combustible.tipo_equipo ? 'Selecciona la unidad' : 'Elige un tipo primero'}
                                    disabled={!combustible.tipo_equipo}
                                    filter
                                />
                            </div>
                        </div>
                    </div>

                    <div className="field">
                        <label htmlFor="id_operador">Operador <span style={{ color: 'red' }}>*</span></label>
                        <Dropdown
                            id="id_operador"
                            value={combustible.id_operador}
                            options={operadores.map((o) => ({ label: o.nombre, value: o.id }))}
                            onChange={(e) => setCombustible({ ...combustible, id_operador: e.value })}
                            placeholder="Selecciona un operador"
                            filter
                        />
                    </div>

                    <div className="grid">
                        <div className="col-6">
                            <div className="field">
                                <label htmlFor="kilometraje">Kilometraje</label>
                                <InputNumber id="kilometraje" value={combustible.kilometraje ?? null} onValueChange={(e) => setCombustible({ ...combustible, kilometraje: e.value ?? null })} min={0} disabled={combustible.tipo_equipo !== 'camion'} placeholder="Solo camiones" />
                            </div>
                        </div>
                        <div className="col-6">
                            <div className="field">
                                <label htmlFor="horometro">Horómetro</label>
                                <InputNumber id="horometro" value={combustible.horometro ?? null} onValueChange={(e) => setCombustible({ ...combustible, horometro: e.value ?? null })} min={0} disabled={combustible.tipo_equipo !== 'maquinaria'} placeholder="Solo maquinaria" />
                            </div>
                        </div>
                    </div>

                    <CapturaFoto label="Indicador de combustible (antes de cargar)" value={fotoAntes} onChange={setFotoAntes} toast={toast} />
                </>
            )}

            {fase === 2 && (
                <>
                    <CapturaFoto label="Bomba de combustible (cuánto se cargó)" value={fotoBomba} onChange={setFotoBomba} toast={toast} />
                    <CapturaFoto label="Indicador de combustible (después de cargar)" value={fotoDespues} onChange={setFotoDespues} toast={toast} />
                </>
            )}

            {fase === 3 && (
                <>
                    <div className="grid">
                        <div className="col-6">
                            <div className="field">
                                <label htmlFor="precio_unitario">Precio por Litro <span style={{ color: 'red' }}>*</span></label>
                                <InputNumber
                                    id="precio_unitario"
                                    value={combustible.precio_unitario ?? null}
                                    onValueChange={(e) => setCombustible({ ...combustible, precio_unitario: e.value ?? null })}
                                    mode="currency"
                                    currency="MXN"
                                    locale="es-MX"
                                    min={0}
                                />
                            </div>
                        </div>
                        <div className="col-6">
                            <div className="field">
                                <label htmlFor="litros">Litros <span style={{ color: 'red' }}>*</span></label>
                                <InputLitros
                                    id="litros"
                                    value={combustible.litros ?? null}
                                    onChange={(litros) => setCombustible({ ...combustible, litros })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="field">
                        <label htmlFor="importe">Importe cargado <span style={{ color: 'red' }}>*</span></label>
                        <InputLitros id="importe" moneda value={combustible.importe ?? null} onChange={(importe) => setCombustible({ ...combustible, importe })} />
                    </div>
                </>
            )}
        </Dialog>
    );
};

export default CombustibleWizardDialog;
