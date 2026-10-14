'use client';

import React, { useMemo, useState } from 'react';
import { AgendaEvento } from '../../../../../Services/BD/agendaService';

// Vista de la agenda para celular. La cuadrícula de FullCalendar no cabe en
// pantallas angostas, así que aquí se dibuja una vista propia tipo app:
// segmento Día/Semana/Mes, tira de la semana y línea de tiempo con tarjetas.

export interface EventoMovil {
    evento: AgendaEvento;
    color: string;
    icono: string;
    detalle: string;
    iniciales: string | null;
}

interface AgendaMovilProps {
    eventos: EventoMovil[];
    loading: boolean;
    selectorUsuario?: React.ReactNode;
    onNuevo: (fecha?: Date) => void;
    onEditar: (evento: AgendaEvento) => void;
}

type VistaMovil = 'dia' | 'semana' | 'mes';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const INICIALES_DIA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);
const inicioDelDia = (fecha: Date) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
const sumarDias = (fecha: Date, dias: number) => new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);
const mismoDia = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const inicioDeSemana = (fecha: Date) => sumarDias(inicioDelDia(fecha), -((fecha.getDay() + 6) % 7)); // lunes
const formatoHora = (fecha: Date) => fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const tituloDia = (fecha: Date) => `${capitalizar(DIAS[fecha.getDay()])}, ${fecha.getDate()} de ${MESES[fecha.getMonth()]}`;

const AgendaMovil: React.FC<AgendaMovilProps> = ({ eventos, loading, selectorUsuario, onNuevo, onEditar }) => {
    const hoy = inicioDelDia(new Date());
    const [vista, setVista] = useState<VistaMovil>('dia');
    const [fechaSel, setFechaSel] = useState<Date>(hoy);

    const eventosDelDia = (dia: Date) => {
        const inicio = inicioDelDia(dia);
        const fin = sumarDias(inicio, 1);
        return eventos.filter(({ evento }) => new Date(evento.fecha_inicio) < fin && new Date(evento.fecha_fin) >= inicio).sort((a, b) => new Date(a.evento.fecha_inicio).getTime() - new Date(b.evento.fecha_inicio).getTime());
    };

    const semana = useMemo(() => {
        const lunes = inicioDeSemana(fechaSel);
        return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
    }, [fechaSel]);

    const diasConEventos = useMemo(() => {
        const set = new Set<string>();
        eventos.forEach(({ evento }) => {
            const d = new Date(evento.fecha_inicio);
            set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
        });
        return set;
    }, [eventos]);
    const tieneEventos = (dia: Date) => diasConEventos.has(`${dia.getFullYear()}-${dia.getMonth()}-${dia.getDate()}`);

    const mover = (direccion: 1 | -1) => {
        if (vista === 'mes') setFechaSel(new Date(fechaSel.getFullYear(), fechaSel.getMonth() + direccion, 1));
        else setFechaSel(sumarDias(fechaSel, 7 * direccion));
    };

    const nuevoEnFecha = () => {
        // Propone el día seleccionado; si es hoy, deja que el padre redondee a la siguiente media hora.
        if (mismoDia(fechaSel, hoy)) return onNuevo();
        const fecha = new Date(fechaSel);
        fecha.setHours(9, 0, 0, 0);
        onNuevo(fecha);
    };

    const tarjeta = (item: EventoMovil, dia: Date) => {
        const { evento, color, icono, detalle, iniciales } = item;
        const inicio = new Date(evento.fecha_inicio);
        const fin = new Date(evento.fecha_fin);
        const horario = mismoDia(inicio, dia) && mismoDia(fin, dia) ? `${formatoHora(inicio)} - ${formatoHora(fin)}` : 'Todo el día';
        return (
            <button
                key={`${evento.id}-${dia.getTime()}`}
                type="button"
                className={`agm-ev${evento.estado === 'cancelado' ? ' agenda-evento-cancelado' : evento.estado === 'completado' ? ' agenda-evento-completado' : ''}`}
                style={{ '--ev-color': color } as React.CSSProperties}
                onClick={() => onEditar(evento)}
            >
                <div className="agm-ev-info">
                    <div className="agenda-ev-titulo agm-ev-titulo">{evento.titulo}</div>
                    {detalle && <div className="agm-ev-detalle">{detalle}</div>}
                    <div className="agm-ev-horario">{horario}</div>
                </div>
                <div className="agm-ev-avatar">{iniciales ?? <i className={icono} />}</div>
            </button>
        );
    };

    const vacio = (texto: string) => (
        <div className="agm-vacio">
            <i className="pi pi-calendar" />
            <span>{texto}</span>
        </div>
    );

    // Línea de tiempo del día: una fila por hora con las tarjetas que empiezan en esa hora.
    const renderDia = () => {
        const delDia = eventosDelDia(fechaSel);
        if (!delDia.length) return vacio('No tienes eventos este día');

        const porHora = new Map<number, EventoMovil[]>();
        const todoElDia: EventoMovil[] = [];
        delDia.forEach((item) => {
            const inicio = new Date(item.evento.fecha_inicio);
            if (!mismoDia(inicio, fechaSel) || !mismoDia(new Date(item.evento.fecha_fin), fechaSel)) {
                todoElDia.push(item);
                return;
            }
            const h = inicio.getHours();
            porHora.set(h, [...(porHora.get(h) ?? []), item]);
        });

        const horas = Array.from(porHora.keys());
        const primera = horas.length ? Math.min(9, ...horas) : 9;
        const ultima = horas.length ? Math.max(17, ...horas) : 17;

        return (
            <div className="agm-timeline">
                {todoElDia.length > 0 && (
                    <div className="agm-fila">
                        <span className="agm-hora">Todo el día</span>
                        <div className="agm-fila-eventos">{todoElDia.map((item) => tarjeta(item, fechaSel))}</div>
                    </div>
                )}
                {Array.from({ length: ultima - primera + 1 }, (_, i) => primera + i).map((h) => (
                    <div key={h} className="agm-fila">
                        <span className="agm-hora">{`${String(h).padStart(2, '0')}:00`}</span>
                        <div className="agm-fila-eventos">{(porHora.get(h) ?? []).map((item) => tarjeta(item, fechaSel))}</div>
                    </div>
                ))}
            </div>
        );
    };

    const renderSemana = () => (
        <div className="agm-semana">
            {semana.map((dia) => {
                const delDia = eventosDelDia(dia);
                return (
                    <div key={dia.getTime()} className="agm-semana-dia">
                        <button
                            type="button"
                            className={`agm-semana-titulo${mismoDia(dia, hoy) ? ' agm-hoy' : ''}`}
                            onClick={() => {
                                setFechaSel(dia);
                                setVista('dia');
                            }}
                        >
                            {tituloDia(dia)}
                            <span>{delDia.length ? `${delDia.length} ${delDia.length === 1 ? 'evento' : 'eventos'}` : 'Sin eventos'}</span>
                        </button>
                        {delDia.map((item) => tarjeta(item, dia))}
                    </div>
                );
            })}
        </div>
    );

    const renderMes = () => {
        const primero = new Date(fechaSel.getFullYear(), fechaSel.getMonth(), 1);
        const inicio = inicioDeSemana(primero);
        const semanas = Math.ceil((((primero.getDay() + 6) % 7) + new Date(fechaSel.getFullYear(), fechaSel.getMonth() + 1, 0).getDate()) / 7);
        return (
            <div className="agm-mes">
                {INICIALES_DIA.map((d, i) => (
                    <span key={i} className="agm-mes-encabezado">
                        {d}
                    </span>
                ))}
                {Array.from({ length: semanas * 7 }, (_, i) => sumarDias(inicio, i)).map((dia) => (
                    <button
                        key={dia.getTime()}
                        type="button"
                        className={`agm-mes-dia${dia.getMonth() !== fechaSel.getMonth() ? ' agm-fuera' : ''}${mismoDia(dia, hoy) ? ' agm-hoy' : ''}`}
                        onClick={() => {
                            setFechaSel(dia);
                            setVista('dia');
                        }}
                    >
                        <span>{dia.getDate()}</span>
                        {tieneEventos(dia) && <i className="agm-punto" />}
                    </button>
                ))}
            </div>
        );
    };

    return (
        <div className="agm">
            <div className="agm-top">
                <button type="button" className="agm-hoy-btn" onClick={() => setFechaSel(hoy)}>
                    Hoy
                </button>
                <h3 className="agm-titulo">
                    Agenda
                    {loading && <i className="pi pi-spin pi-spinner" />}
                </h3>
                <button type="button" className="agm-fab" aria-label="Nuevo evento" onClick={nuevoEnFecha}>
                    <i className="pi pi-plus" />
                </button>
            </div>

            {selectorUsuario && <div className="agm-selector">{selectorUsuario}</div>}

            <div className="agm-segmento" role="tablist">
                {(['dia', 'semana', 'mes'] as VistaMovil[]).map((v) => (
                    <button key={v} type="button" role="tab" aria-selected={vista === v} className={`agm-segmento-opcion${vista === v ? ' activo' : ''}`} onClick={() => setVista(v)}>
                        {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
                    </button>
                ))}
            </div>

            <div className="agm-nav">
                <button type="button" className="agm-flecha" aria-label="Anterior" onClick={() => mover(-1)}>
                    <i className="pi pi-chevron-left" />
                </button>
                {vista === 'mes' ? (
                    <span className="agm-nav-titulo">
                        {capitalizar(MESES[fechaSel.getMonth()])} {fechaSel.getFullYear()}
                    </span>
                ) : (
                    <div className="agm-tira">
                        {semana.map((dia, i) => (
                            <button
                                key={dia.getTime()}
                                type="button"
                                className={`agm-tira-dia${mismoDia(dia, fechaSel) ? ' seleccionado' : ''}${mismoDia(dia, hoy) ? ' agm-hoy' : ''}`}
                                onClick={() => {
                                    setFechaSel(dia);
                                    setVista('dia');
                                }}
                            >
                                <span className="agm-tira-letra">{INICIALES_DIA[i]}</span>
                                <span className="agm-tira-numero">{dia.getDate()}</span>
                                <i className={`agm-punto${tieneEventos(dia) ? '' : ' oculto'}`} />
                            </button>
                        ))}
                    </div>
                )}
                <button type="button" className="agm-flecha" aria-label="Siguiente" onClick={() => mover(1)}>
                    <i className="pi pi-chevron-right" />
                </button>
            </div>

            {vista === 'dia' && <div className="agm-fecha">{tituloDia(fechaSel)}</div>}

            {vista === 'dia' && renderDia()}
            {vista === 'semana' && renderSemana()}
            {vista === 'mes' && renderMes()}
        </div>
    );
};

export default AgendaMovil;
