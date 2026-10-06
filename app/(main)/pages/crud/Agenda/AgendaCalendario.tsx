'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { CalendarApi, DatesSetArg, DayHeaderContentArg, EventClickArg, EventContentArg } from '@fullcalendar/core';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { Calendar as PrimeCalendar } from 'primereact/calendar';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import {
    AgendaEvento,
    EstadoEvento,
    TipoEvento,
    UsuarioSimple,
    createEvento,
    deleteEvento,
    fetchEventosDeUsuario,
    fetchTodosLosEventos,
    fetchUsuariosParaAgenda,
    updateEvento
} from '../../../../../Services/BD/agendaService';

// FullCalendar toca APIs del DOM al montarse; en el App Router de Next.js los
// componentes 'use client' igual se renderizan primero en el servidor, así
// que se carga solo en el navegador para evitar un 500 por SSR.
const FullCalendar = dynamic(() => import('@fullcalendar/react'), {
    ssr: false,
    loading: () => (
        <div className="agenda-calendario-cargando">
            <i className="pi pi-spin pi-spinner" /> Cargando calendario...
        </div>
    )
});

interface AgendaCalendarioProps {
    userId: number;
    esAdmin: boolean;
    toast: React.RefObject<Toast>;
}

const TIPOS: { label: string; value: TipoEvento; color: string; icon: string }[] = [
    { label: 'Reunión', value: 'reunion', color: '#2563eb', icon: 'pi pi-users' },
    { label: 'Conferencia', value: 'conferencia', color: '#7c3aed', icon: 'pi pi-video' },
    { label: 'Llamada', value: 'llamada', color: '#16a34a', icon: 'pi pi-phone' },
    { label: 'Otro', value: 'otro', color: '#ea580c', icon: 'pi pi-bookmark' }
];

const ESTADOS: { label: string; value: EstadoEvento; severity: 'info' | 'success' | 'danger' }[] = [
    { label: 'Programado', value: 'programado', severity: 'info' },
    { label: 'Completado', value: 'completado', severity: 'success' },
    { label: 'Cancelado', value: 'cancelado', severity: 'danger' }
];

const colorDeTipo = (tipo: TipoEvento) => TIPOS.find((t) => t.value === tipo)?.color ?? '#2563eb';

// Paleta para distinguir a cada persona cuando Admin ve "Todo el personal".
// Se asigna por userid (siempre el mismo color para la misma persona).
const PALETA_PERSONAS = ['#2563eb', '#dc2626', '#16a34a', '#7c3aed', '#ea580c', '#0891b2', '#db2777', '#65a30d', '#9333ea', '#0d9488'];
const colorDePersona = (userid: number) => PALETA_PERSONAS[userid % PALETA_PERSONAS.length];

type VistaCalendario = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth' | 'listWeek' | 'listMonth';

const VISTAS_SEGMENTO: { label: string; value: VistaCalendario }[] = [
    { label: 'Día', value: 'timeGridDay' },
    { label: 'Semana', value: 'timeGridWeek' },
    { label: 'Mes', value: 'dayGridMonth' }
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);
const claveDia = (fecha: Date) => `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
const formatoHora = (fecha: Date | null) => (fecha ? fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }) : '');

// Título del encabezado según la vista: "28 de septiembre – 4 de octubre", "Octubre 2026", etc.
const tituloDelRango = (inicio: Date, finExclusivo: Date, vista: VistaCalendario) => {
    const fin = new Date(finExclusivo);
    fin.setDate(fin.getDate() - 1);
    if (vista === 'dayGridMonth' || vista === 'listMonth') {
        return `${capitalizar(MESES[inicio.getMonth()])} ${inicio.getFullYear()}`;
    }
    if (vista === 'timeGridDay') {
        return `${capitalizar(DIAS[inicio.getDay()])} ${inicio.getDate()} de ${MESES[inicio.getMonth()]}`;
    }
    if (inicio.getMonth() === fin.getMonth()) {
        return `${inicio.getDate()} – ${fin.getDate()} de ${MESES[fin.getMonth()]}`;
    }
    return `${inicio.getDate()} de ${MESES[inicio.getMonth()]} – ${fin.getDate()} de ${MESES[fin.getMonth()]}`;
};

const nuevaFechaRedondeada = (base?: Date) => {
    const fecha = base ? new Date(base) : new Date();
    if (!base) {
        fecha.setMinutes(fecha.getMinutes() >= 30 ? 60 : 30, 0, 0);
    }
    return fecha;
};

const emptyEvento = (userId: number, inicio?: Date): Omit<AgendaEvento, 'id' | 'usuario_nombre' | 'creado_por_nombre'> => {
    const fechaInicio = nuevaFechaRedondeada(inicio);
    const fechaFin = new Date(fechaInicio);
    fechaFin.setHours(fechaFin.getHours() + 1);
    return {
        userid: userId,
        creado_por: userId,
        titulo: '',
        descripcion: '',
        tipo: 'reunion',
        fecha_inicio: fechaInicio.toISOString(),
        fecha_fin: fechaFin.toISOString(),
        ubicacion: '',
        estado: 'programado',
        color: colorDeTipo('reunion')
    };
};

const AgendaCalendario: React.FC<AgendaCalendarioProps> = ({ userId, esAdmin, toast }) => {
    const [eventos, setEventos] = useState<AgendaEvento[]>([]);
    const [usuarios, setUsuarios] = useState<UsuarioSimple[]>([]);
    const [verUsuarioId, setVerUsuarioId] = useState<number | 'todos'>(userId);
    const [loading, setLoading] = useState(false);

    const [dialogVisible, setDialogVisible] = useState(false);
    const [editando, setEditando] = useState<AgendaEvento | null>(null);
    const [form, setForm] = useState<Omit<AgendaEvento, 'id' | 'usuario_nombre' | 'creado_por_nombre'>>(emptyEvento(userId));
    const [submitted, setSubmitted] = useState(false);
    const [guardando, setGuardando] = useState(false);

    // La barra de navegación es propia (no la de FullCalendar), así que
    // guardamos su API y el rango visible cada vez que cambia la vista.
    const calendarApi = useRef<CalendarApi | null>(null);
    const [vista, setVista] = useState<VistaCalendario>('timeGridWeek');
    const [rango, setRango] = useState<{ inicio: Date; fin: Date } | null>(null);

    const cargar = async () => {
        setLoading(true);
        try {
            if (esAdmin && verUsuarioId === 'todos') {
                setEventos(await fetchTodosLosEventos());
            } else {
                const idObjetivo = esAdmin ? (verUsuarioId as number) : userId;
                setEventos(await fetchEventosDeUsuario(idObjetivo));
            }
        } catch (err) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los eventos', life: 3000 });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, verUsuarioId]);

    useEffect(() => {
        if (esAdmin) {
            fetchUsuariosParaAgenda()
                .then(setUsuarios)
                .catch(() => undefined);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [esAdmin]);

    const opcionesUsuario = useMemo(
        () => [{ label: 'Todo el personal', value: 'todos' as const }, ...usuarios.map((u) => ({ label: `${u.nombre} ${u.apellido}`.trim(), value: u.id }))],
        [usuarios]
    );

    // Solo tiene sentido diferenciar por persona cuando Admin está viendo la
    // agenda de "Todo el personal" (varios dueños mezclados); viendo la suya
    // o la de alguien en específico, todo es de una sola persona.
    const vistaTodoElPersonal = esAdmin && verUsuarioId === 'todos';

    const eventosCalendario = useMemo(
        () =>
            eventos.map((ev) => {
                const color = ev.estado === 'cancelado' ? '#94a3b8' : vistaTodoElPersonal ? colorDePersona(ev.userid) : ev.color || colorDeTipo(ev.tipo);
                return {
                    id: String(ev.id),
                    title: ev.titulo,
                    start: ev.fecha_inicio,
                    end: ev.fecha_fin,
                    // El color se pinta dentro de la tarjeta (eventContent); FullCalendar
                    // solo pone la caja transparente.
                    backgroundColor: 'transparent',
                    borderColor: 'transparent',
                    classNames: ev.estado === 'cancelado' ? ['agenda-evento-cancelado'] : ev.estado === 'completado' ? ['agenda-evento-completado'] : [],
                    extendedProps: { evento: ev, color }
                };
            }),
        [eventos, vistaTodoElPersonal]
    );

    // Cantidad de eventos por día (para el encabezado de cada columna).
    const eventosPorDia = useMemo(() => {
        const conteo = new Map<string, number>();
        eventos.forEach((ev) => {
            const clave = claveDia(new Date(ev.fecha_inicio));
            conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
        });
        return conteo;
    }, [eventos]);

    const eventosEnRango = useMemo(() => {
        if (!rango) return 0;
        return eventos.filter((ev) => new Date(ev.fecha_inicio) < rango.fin && new Date(ev.fecha_fin) >= rango.inicio).length;
    }, [eventos, rango]);

    const onDatesSet = (arg: DatesSetArg) => {
        calendarApi.current = arg.view.calendar;
        setVista(arg.view.type as VistaCalendario);
        setRango({ inicio: arg.view.currentStart, fin: arg.view.currentEnd });
    };

    const esLista = vista === 'listWeek' || vista === 'listMonth';

    const cambiarVista = (nueva: VistaCalendario) => calendarApi.current?.changeView(nueva);

    const alternarLista = () => {
        if (vista === 'listWeek') cambiarVista('timeGridWeek');
        else if (vista === 'listMonth') cambiarVista('dayGridMonth');
        else cambiarVista(vista === 'dayGridMonth' ? 'listMonth' : 'listWeek');
    };

    const abrirNuevo = (fecha?: Date) => {
        setEditando(null);
        setForm(emptyEvento(esAdmin && verUsuarioId !== 'todos' ? (verUsuarioId as number) : userId, fecha));
        setSubmitted(false);
        setDialogVisible(true);
    };

    const abrirEditar = (evento: AgendaEvento) => {
        setEditando(evento);
        setForm({ ...evento });
        setSubmitted(false);
        setDialogVisible(true);
    };

    const onDateClick = (arg: DateClickArg) => {
        const fecha = new Date(arg.date);
        // Clic en un día completo (vista Mes o fila "Todo el día"): proponer 9:00.
        if (arg.allDay) fecha.setHours(9, 0, 0, 0);
        abrirNuevo(fecha);
    };
    const onEventClick = (arg: EventClickArg) => {
        const evento = arg.event.extendedProps.evento as AgendaEvento;
        abrirEditar(evento);
    };

    const cerrarDialog = () => setDialogVisible(false);

    const guardar = async () => {
        setSubmitted(true);
        const inicio = new Date(form.fecha_inicio);
        const fin = new Date(form.fecha_fin);
        if (!form.titulo?.trim() || fin < inicio) return;

        setGuardando(true);
        try {
            if (editando?.id) {
                const actualizado = await updateEvento(editando.id, form);
                setEventos((prev) => prev.map((e) => (e.id === actualizado.id ? actualizado : e)));
                toast.current?.show({ severity: 'success', summary: 'Actualizado', detail: 'Evento actualizado', life: 3000 });
            } else {
                const creado = await createEvento({ ...form, creado_por: userId });
                setEventos((prev) => [...prev, creado]);
                toast.current?.show({ severity: 'success', summary: 'Agendado', detail: 'Evento agendado', life: 3000 });
            }
            setDialogVisible(false);
        } catch (err) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar el evento', life: 3000 });
        } finally {
            setGuardando(false);
        }
    };

    const eliminar = async () => {
        if (!editando?.id) return;
        try {
            await deleteEvento(editando.id);
            setEventos((prev) => prev.filter((e) => e.id !== editando.id));
            toast.current?.show({ severity: 'success', summary: 'Eliminado', detail: 'Evento eliminado', life: 3000 });
            setDialogVisible(false);
        } catch (err) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar el evento', life: 3000 });
        }
    };

    const renderEventContent = (arg: EventContentArg) => {
        const evento = arg.event.extendedProps.evento as AgendaEvento;
        const color = arg.event.extendedProps.color as string;
        const tipo = TIPOS.find((t) => t.value === evento.tipo);
        const hora = arg.event.allDay ? 'Todo el día' : formatoHora(arg.event.start);
        const detalle = vistaTodoElPersonal && evento.usuario_nombre ? evento.usuario_nombre : evento.ubicacion || tipo?.label || '';
        const estilo = { '--ev-color': color } as React.CSSProperties;

        if (arg.view.type === 'dayGridMonth') {
            return (
                <div className="agenda-ev agenda-ev-mini" style={estilo} title={arg.event.title}>
                    {!arg.event.allDay && <span className="agenda-ev-hora">{hora}</span>}
                    <span className="agenda-ev-titulo">{arg.event.title}</span>
                </div>
            );
        }

        if (arg.view.type.startsWith('list')) {
            return (
                <div className="agenda-ev-lista">
                    {tipo && <i className={tipo.icon} style={{ color }} />}
                    <span className="agenda-ev-titulo">{arg.event.title}</span>
                    {detalle && <span className="agenda-ev-detalle">· {detalle}</span>}
                </div>
            );
        }

        return (
            <div className="agenda-ev" style={estilo} title={`${arg.event.title}${detalle ? ` · ${detalle}` : ''}`}>
                <div className="agenda-ev-titulo">{arg.event.title}</div>
                <div className="agenda-ev-sub">
                    {hora}
                    {detalle && ` · ${detalle}`}
                </div>
            </div>
        );
    };

    const renderDayHeader = (arg: DayHeaderContentArg) => {
        const dia = DIAS_CORTOS[arg.date.getDay()];
        if (arg.view.type === 'dayGridMonth') {
            return <span className="agenda-dh-dia">{dia}</span>;
        }
        const total = eventosPorDia.get(claveDia(arg.date)) ?? 0;
        const finDeSemana = arg.date.getDay() === 0 || arg.date.getDay() === 6;
        return (
            <div className={`agenda-dh${arg.isToday ? ' agenda-dh-hoy' : ''}${finDeSemana ? ' agenda-dh-finde' : ''}`}>
                <span className="agenda-dh-dia">{arg.isToday ? `${dia} · HOY` : dia}</span>
                <span className="agenda-dh-numero">{arg.date.getDate()}</span>
                <span className="agenda-dh-conteo">{total === 0 ? 'Sin eventos' : `${total} ${total === 1 ? 'evento' : 'eventos'}`}</span>
            </div>
        );
    };

    return (
        <div className="agenda-calendario">
            <div className="agenda-cal-top">
                <div className="agenda-cal-top-izq">
                    <span className="agenda-cal-etiqueta">Calendario</span>
                    {esAdmin && (
                        <Dropdown
                            value={verUsuarioId}
                            options={[{ label: 'Mi agenda', value: userId }, ...opcionesUsuario]}
                            onChange={(e) => setVerUsuarioId(e.value)}
                            className="agenda-selector-usuario"
                        />
                    )}
                    {loading && <i className="pi pi-spin pi-spinner agenda-cal-spinner" />}
                </div>
                <button type="button" className={`agenda-btn${esLista ? ' agenda-btn-activo' : ''}`} onClick={alternarLista}>
                    <i className={esLista ? 'pi pi-calendar' : 'pi pi-list'} />
                    {esLista ? 'Verlo en calendario' : 'Verlo en lista'}
                </button>
            </div>

            <div className="agenda-cal-nav">
                <div className="agenda-cal-nav-izq">
                    <button type="button" className="agenda-btn" onClick={() => calendarApi.current?.today()}>
                        Hoy
                    </button>
                    <div className="agenda-cal-flechas">
                        <button type="button" className="agenda-btn agenda-btn-icono" aria-label="Anterior" onClick={() => calendarApi.current?.prev()}>
                            <i className="pi pi-chevron-left" />
                        </button>
                        <button type="button" className="agenda-btn agenda-btn-icono" aria-label="Siguiente" onClick={() => calendarApi.current?.next()}>
                            <i className="pi pi-chevron-right" />
                        </button>
                    </div>
                    {rango && (
                        <h3 className="agenda-cal-titulo">
                            {tituloDelRango(rango.inicio, rango.fin, vista)}
                            <span className="agenda-cal-conteo">
                                {eventosEnRango} {eventosEnRango === 1 ? 'evento' : 'eventos'}
                            </span>
                        </h3>
                    )}
                </div>
                <div className="agenda-cal-nav-der">
                    <div className="agenda-segmento" role="tablist">
                        {VISTAS_SEGMENTO.map((v) => (
                            <button
                                key={v.value}
                                type="button"
                                role="tab"
                                aria-selected={vista === v.value}
                                className={`agenda-segmento-opcion${vista === v.value ? ' activo' : ''}`}
                                onClick={() => cambiarVista(v.value)}
                            >
                                {v.label}
                            </button>
                        ))}
                    </div>
                    <Button label="Nuevo evento" icon="pi pi-plus" rounded className="agenda-btn-nuevo" onClick={() => abrirNuevo()} />
                </div>
            </div>

            <div className={`agenda-cal-grid agenda-vista-${vista}`}>
                <FullCalendar
                    plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
                    initialView="timeGridWeek"
                    locale={esLocale}
                    firstDay={1}
                    headerToolbar={false}
                    height={vista.startsWith('timeGrid') ? 760 : 'auto'}
                    datesSet={onDatesSet}
                    selectable
                    dateClick={onDateClick}
                    eventClick={onEventClick}
                    events={eventosCalendario}
                    eventContent={renderEventContent}
                    eventDisplay="block"
                    dayHeaderContent={renderDayHeader}
                    allDayText="Todo el día"
                    slotDuration="00:30:00"
                    slotLabelInterval="01:00"
                    slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                    scrollTime="08:00:00"
                    dayMaxEvents={3}
                    moreLinkText={(n) => `+${n} más`}
                    noEventsText="No hay eventos en este periodo"
                    nowIndicator
                />
            </div>

            <Dialog
                visible={dialogVisible}
                style={{ width: '36rem' }}
                header={editando ? 'Editar evento' : 'Nuevo evento'}
                modal
                className="p-fluid"
                onHide={cerrarDialog}
                footer={
                    <>
                        {editando && <Button label="Eliminar" icon="pi pi-trash" severity="danger" text onClick={eliminar} />}
                        <Button label="Cancelar" icon="pi pi-times" text onClick={cerrarDialog} />
                        <Button label="Guardar" icon="pi pi-check" loading={guardando} onClick={guardar} />
                    </>
                }
            >
                <div className="field">
                    <label htmlFor="evento-titulo">Título *</label>
                    <InputText
                        id="evento-titulo"
                        value={form.titulo}
                        onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                        className={submitted && !form.titulo?.trim() ? 'p-invalid' : ''}
                        autoFocus
                    />
                    {submitted && !form.titulo?.trim() && <small className="p-error">El título es obligatorio.</small>}
                </div>

                <div className="formgrid grid">
                    <div className="field col-6">
                        <label htmlFor="evento-tipo">Tipo</label>
                        <Dropdown
                            id="evento-tipo"
                            value={form.tipo}
                            options={TIPOS}
                            onChange={(e) => setForm({ ...form, tipo: e.value, color: colorDeTipo(e.value) })}
                            itemTemplate={(opt) => (
                                <span>
                                    <i className={opt.icon} style={{ color: opt.color, marginRight: '.5rem' }} />
                                    {opt.label}
                                </span>
                            )}
                        />
                    </div>
                    <div className="field col-6">
                        <label htmlFor="evento-estado">Estado</label>
                        <Dropdown id="evento-estado" value={form.estado} options={ESTADOS} onChange={(e) => setForm({ ...form, estado: e.value })} />
                    </div>
                </div>

                {esAdmin && (
                    <div className="field">
                        <label htmlFor="evento-asignado">Asignar a</label>
                        <Dropdown
                            id="evento-asignado"
                            value={form.userid}
                            options={[{ label: 'Yo mismo', value: userId }, ...usuarios.map((u) => ({ label: `${u.nombre} ${u.apellido}`.trim(), value: u.id }))]}
                            onChange={(e) => setForm({ ...form, userid: e.value })}
                            filter
                        />
                    </div>
                )}

                <div className="formgrid grid">
                    <div className="field col-6">
                        <label htmlFor="evento-inicio">Inicio *</label>
                        <PrimeCalendar
                            id="evento-inicio"
                            value={new Date(form.fecha_inicio)}
                            onChange={(e) => {
                                const fecha = e.value as Date;
                                if (!fecha) return;
                                setForm({ ...form, fecha_inicio: fecha.toISOString() });
                            }}
                            showTime
                            hourFormat="12"
                            dateFormat="dd/mm/yy"
                        />
                    </div>
                    <div className="field col-6">
                        <label htmlFor="evento-fin">Fin *</label>
                        <PrimeCalendar
                            id="evento-fin"
                            value={new Date(form.fecha_fin)}
                            onChange={(e) => {
                                const fecha = e.value as Date;
                                if (!fecha) return;
                                setForm({ ...form, fecha_fin: fecha.toISOString() });
                            }}
                            showTime
                            hourFormat="12"
                            dateFormat="dd/mm/yy"
                            className={submitted && new Date(form.fecha_fin) < new Date(form.fecha_inicio) ? 'p-invalid' : ''}
                        />
                        {submitted && new Date(form.fecha_fin) < new Date(form.fecha_inicio) && <small className="p-error">Debe ser posterior al inicio.</small>}
                    </div>
                </div>

                <div className="field">
                    <label htmlFor="evento-ubicacion">Lugar / Link de la reunión</label>
                    <InputText id="evento-ubicacion" value={form.ubicacion ?? ''} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
                </div>

                <div className="field">
                    <label htmlFor="evento-desc">Notas</label>
                    <InputTextarea id="evento-desc" value={form.descripcion ?? ''} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} />
                </div>

                {editando && (editando.usuario_nombre || editando.creado_por_nombre) && (
                    <div className="agenda-evento-meta">
                        {editando.usuario_nombre && <Tag severity="info" value={`Para: ${editando.usuario_nombre}`} />}
                        {editando.creado_por_nombre && <Tag value={`Agendado por: ${editando.creado_por_nombre}`} />}
                    </div>
                )}
            </Dialog>
        </div>
    );
};

export default AgendaCalendario;
