// app/(main)/pages/crud/TicketViajeDialog.tsx
'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { FileUpload, FileUploadHandlerEvent } from 'primereact/fileupload';
import { Toast } from 'primereact/toast';
import {
    buscarTicketDeLogistica,
    fetchTicketDeViaje,
    subirTicketDeLogistica,
    subirTicketDeViaje,
    TicketViaje,
    urlTicket
} from '../../../../Services/BD/viajeService';

// De dónde sale la foto: un viaje que sigue en logística (por su id de
// logística) o uno ya aprobado en `viajes` (por su id de viaje).
export type OrigenTicket = { tipo: 'logistica'; id: number } | { tipo: 'viaje'; id: number };

interface Props {
    origen: OrigenTicket | null;
    folio?: string;
    onHide: () => void;
}

// Ver, subir o cambiar la foto del ticket de carga. La foto es opcional:
// aprobar un viaje no depende de que exista.
const TicketViajeDialog = ({ origen, folio, onHide }: Props) => {
    const toast = useRef<Toast>(null);
    const subida = useRef<FileUpload>(null);
    const [ticket, setTicket] = useState<TicketViaje | null>(null);
    const [url, setUrl] = useState<string | null>(null);
    const [cargando, setCargando] = useState(false);
    const [subiendo, setSubiendo] = useState(false);

    // Se depende del tipo y el id (no del objeto) porque quien usa la ventana
    // arma `origen` de nuevo en cada render.
    const tipo = origen?.tipo;
    const id = origen?.id;

    useEffect(() => {
        if (!tipo || !id) return;
        let cancelado = false;

        const cargar = async () => {
            setCargando(true);
            setTicket(null);
            setUrl(null);
            try {
                const t = tipo === 'logistica' ? await buscarTicketDeLogistica(id) : await fetchTicketDeViaje(id);
                const u = t ? await urlTicket(t.foto_ticket) : null;
                if (!cancelado) {
                    setTicket(t);
                    // Al reemplazar en logística la ruta es la misma: el ?v= evita ver la foto anterior en caché.
                    setUrl(u && t ? `${u}&v=${encodeURIComponent(t.foto_ticket_at || '')}` : null);
                }
            } catch (error) {
                console.error('Error cargando ticket:', error);
                if (!cancelado) toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la foto del ticket', life: 3000 });
            } finally {
                if (!cancelado) setCargando(false);
            }
        };

        cargar();
        return () => {
            cancelado = true;
        };
    }, [tipo, id]);

    const subir = async (e: FileUploadHandlerEvent) => {
        const archivo = e.files?.[0];
        if (!origen || !archivo) return;

        setSubiendo(true);
        try {
            const t = origen.tipo === 'logistica' ? await subirTicketDeLogistica(origen.id, archivo) : await subirTicketDeViaje(origen.id, archivo);
            const u = await urlTicket(t.foto_ticket);
            setTicket(t);
            setUrl(u ? `${u}&v=${encodeURIComponent(t.foto_ticket_at || '')}` : null);
            toast.current?.show({ severity: 'success', summary: 'Listo', detail: 'Foto del ticket guardada', life: 3000 });
        } catch (error: any) {
            console.error('Error subiendo ticket:', error);
            const sinBucket = /bucket not found/i.test(error?.message || '');
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: sinBucket ? 'Falta correr scripts/ticket_viaje_setup.sql en Supabase' : 'No se pudo guardar la foto',
                life: 5000
            });
        } finally {
            setSubiendo(false);
            subida.current?.clear();
        }
    };

    const fechaFoto = ticket?.foto_ticket_at
        ? new Date(ticket.foto_ticket_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
        : null;

    return (
        <>
            <Toast ref={toast} />
            <Dialog
                visible={!!origen}
                header={folio ? `Ticket de carga · ${folio}` : 'Ticket de carga'}
                modal
                style={{ width: '90%', maxWidth: '560px' }}
                onHide={onHide}
            >
                {cargando ? (
                    <div className="flex justify-content-center p-5">
                        <i className="pi pi-spin pi-spinner text-3xl" />
                    </div>
                ) : (
                    <div className="flex flex-column gap-3">
                        {url ? (
                            <>
                                <a href={url} target="_blank" rel="noreferrer">
                                    <img src={url} alt="Foto del ticket de carga" style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: 8, background: '#f3f4f6' }} />
                                </a>
                                <small className="text-600">
                                    {fechaFoto ? `Tomada el ${fechaFoto}. ` : ''}Haz clic en la foto para abrirla en grande.
                                </small>
                            </>
                        ) : (
                            <div className="text-center text-600 p-4 border-1 border-dashed border-300 border-round">
                                <i className="pi pi-image text-3xl mb-2 block" />
                                Este viaje no tiene foto del ticket.
                            </div>
                        )}

                        <FileUpload
                            ref={subida}
                            mode="basic"
                            name="ticket"
                            accept="image/*"
                            maxFileSize={10000000}
                            customUpload
                            auto
                            uploadHandler={subir}
                            disabled={subiendo}
                            chooseLabel={subiendo ? 'Subiendo…' : url ? 'Cambiar foto' : 'Subir foto'}
                        />
                    </div>
                )}
                <div className="flex justify-content-end mt-3">
                    <Button label="Cerrar" icon="pi pi-times" text onClick={onHide} />
                </div>
            </Dialog>
        </>
    );
};

export default TicketViajeDialog;
