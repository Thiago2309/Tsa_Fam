'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { DragDropContext, Draggable, Droppable, DropResult } from '@hello-pangea/dnd';
import {
    AgendaTarea,
    EstadoTarea,
    PrioridadTarea,
    createTarea,
    deleteTarea,
    fetchTareasDeUsuario,
    reordenarTareas,
    updateTarea
} from '../../../../../Services/BD/agendaService';

interface AgendaKanbanProps {
    userId: number;
    toast: React.RefObject<Toast>;
}

interface Columna {
    estado: EstadoTarea;
    titulo: string;
    color: string;
    fondo: string;
}

const COLUMNAS: Columna[] = [
    { estado: 'pendiente', titulo: 'Pendiente', color: '#64748b', fondo: '#f1f5f9' },
    { estado: 'en_proceso', titulo: 'En Proceso', color: '#2563eb', fondo: '#eff6ff' },
    { estado: 'finalizado', titulo: 'Finalizado', color: '#16a34a', fondo: '#f0fdf4' },
    { estado: 'cancelado', titulo: 'Cancelado', color: '#dc2626', fondo: '#fef2f2' }
];

const PRIORIDADES: { label: string; value: PrioridadTarea; color: string }[] = [
    { label: 'Baja', value: 'baja', color: '#22c55e' },
    { label: 'Media', value: 'media', color: '#f59e0b' },
    { label: 'Alta', value: 'alta', color: '#ef4444' }
];

const emptyTarea = (userId: number, estado: EstadoTarea): Omit<AgendaTarea, 'id'> => ({
    userid: userId,
    titulo: '',
    descripcion: '',
    estado,
    prioridad: 'media',
    fecha_limite: null,
    orden: 0
});

const AgendaKanban: React.FC<AgendaKanbanProps> = ({ userId, toast }) => {
    const [tareas, setTareas] = useState<AgendaTarea[]>([]);
    const [loading, setLoading] = useState(false);

    const [dialogVisible, setDialogVisible] = useState(false);
    const [editando, setEditando] = useState<AgendaTarea | null>(null);
    const [form, setForm] = useState<Omit<AgendaTarea, 'id'>>(emptyTarea(userId, 'pendiente'));
    const [submitted, setSubmitted] = useState(false);
    const [guardando, setGuardando] = useState(false);

    const cargar = async () => {
        setLoading(true);
        try {
            const data = await fetchTareasDeUsuario(userId);
            setTareas(data);
        } catch (err) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las tareas', life: 3000 });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    const porColumna = useMemo(() => {
        const mapa: Record<EstadoTarea, AgendaTarea[]> = { pendiente: [], en_proceso: [], finalizado: [], cancelado: [] };
        tareas
            .slice()
            .sort((a, b) => a.orden - b.orden)
            .forEach((t) => mapa[t.estado].push(t));
        return mapa;
    }, [tareas]);

    const abrirNueva = (estado: EstadoTarea) => {
        setEditando(null);
        setForm(emptyTarea(userId, estado));
        setSubmitted(false);
        setDialogVisible(true);
    };

    const abrirEditar = (tarea: AgendaTarea) => {
        setEditando(tarea);
        setForm({ ...tarea });
        setSubmitted(false);
        setDialogVisible(true);
    };

    const cerrarDialog = () => setDialogVisible(false);

    const guardar = async () => {
        setSubmitted(true);
        if (!form.titulo?.trim()) return;

        setGuardando(true);
        try {
            if (editando?.id) {
                const actualizada = await updateTarea(editando.id, form);
                setTareas((prev) => prev.map((t) => (t.id === actualizada.id ? actualizada : t)));
                toast.current?.show({ severity: 'success', summary: 'Actualizado', detail: 'Tarea actualizada', life: 3000 });
            } else {
                const ordenNuevo = porColumna[form.estado].length;
                const creada = await createTarea({ ...form, orden: ordenNuevo });
                setTareas((prev) => [...prev, creada]);
                toast.current?.show({ severity: 'success', summary: 'Creada', detail: 'Tarea agregada', life: 3000 });
            }
            setDialogVisible(false);
        } catch (err) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar la tarea', life: 3000 });
        } finally {
            setGuardando(false);
        }
    };

    const eliminar = async (tarea: AgendaTarea) => {
        if (!tarea.id) return;
        try {
            await deleteTarea(tarea.id);
            setTareas((prev) => prev.filter((t) => t.id !== tarea.id));
            toast.current?.show({ severity: 'success', summary: 'Eliminada', detail: 'Tarea eliminada', life: 3000 });
            setDialogVisible(false);
        } catch (err) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar la tarea', life: 3000 });
        }
    };

    const onDragEnd = async (result: DropResult) => {
        const { source, destination } = result;
        if (!destination) return;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        const origenEstado = source.droppableId as EstadoTarea;
        const destinoEstado = destination.droppableId as EstadoTarea;

        const listasNuevas: Record<EstadoTarea, AgendaTarea[]> = {
            pendiente: [...porColumna.pendiente],
            en_proceso: [...porColumna.en_proceso],
            finalizado: [...porColumna.finalizado],
            cancelado: [...porColumna.cancelado]
        };

        const [movida] = listasNuevas[origenEstado].splice(source.index, 1);
        const movidaActualizada = { ...movida, estado: destinoEstado };
        listasNuevas[destinoEstado].splice(destination.index, 0, movidaActualizada);

        // Optimista: reflejar de inmediato en pantalla
        const fusionadas = Object.values(listasNuevas).flat();
        setTareas(fusionadas);

        const cambios: { id: number; estado: EstadoTarea; orden: number }[] = [];
        (Object.keys(listasNuevas) as EstadoTarea[]).forEach((estado) => {
            listasNuevas[estado].forEach((t, idx) => {
                if (t.id) cambios.push({ id: t.id, estado, orden: idx });
            });
        });

        try {
            await reordenarTareas(cambios);
        } catch (err) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo mover la tarea', life: 3000 });
            cargar();
        }
    };

    const prioridadInfo = (p: PrioridadTarea) => PRIORIDADES.find((x) => x.value === p) ?? PRIORIDADES[1];

    return (
        <div className="agenda-kanban">
            <DragDropContext onDragEnd={onDragEnd}>
                <div className="agenda-kanban-grid">
                    {COLUMNAS.map((col) => (
                        <div className="agenda-kanban-columna" key={col.estado}>
                            <div className="agenda-kanban-columna-header" style={{ background: col.fondo, borderColor: col.color }}>
                                <span className="agenda-kanban-columna-titulo" style={{ color: col.color }}>
                                    <span className="agenda-kanban-dot" style={{ background: col.color }} />
                                    {col.titulo}
                                    <span className="agenda-kanban-count">{porColumna[col.estado].length}</span>
                                </span>
                                <Button icon="pi pi-plus" rounded text severity="secondary" onClick={() => abrirNueva(col.estado)} tooltip="Agregar tarea" />
                            </div>
                            <Droppable droppableId={col.estado}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`agenda-kanban-lista ${snapshot.isDraggingOver ? 'agenda-kanban-lista-activa' : ''}`}
                                    >
                                        {porColumna[col.estado].map((tarea, index) => (
                                            <Draggable draggableId={String(tarea.id)} index={index} key={tarea.id}>
                                                {(providedDrag, snapshotDrag) => (
                                                    <div
                                                        ref={providedDrag.innerRef}
                                                        {...providedDrag.draggableProps}
                                                        {...providedDrag.dragHandleProps}
                                                        className={`agenda-kanban-card ${snapshotDrag.isDragging ? 'agenda-kanban-card-arrastrando' : ''}`}
                                                        style={{ borderLeftColor: col.color, ...providedDrag.draggableProps.style }}
                                                        onClick={() => abrirEditar(tarea)}
                                                    >
                                                        <div className="agenda-kanban-card-titulo">{tarea.titulo}</div>
                                                        {tarea.descripcion && <div className="agenda-kanban-card-desc">{tarea.descripcion}</div>}
                                                        <div className="agenda-kanban-card-footer">
                                                            <Tag value={prioridadInfo(tarea.prioridad).label} style={{ background: prioridadInfo(tarea.prioridad).color }} />
                                                            {tarea.fecha_limite && (
                                                                <span className="agenda-kanban-card-fecha">
                                                                    <i className="pi pi-calendar" /> {new Date(tarea.fecha_limite + 'T00:00:00').toLocaleDateString('es-MX')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                        {porColumna[col.estado].length === 0 && !loading && (
                                            <div className="agenda-kanban-vacio">Sin tareas</div>
                                        )}
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    ))}
                </div>
            </DragDropContext>

            <Dialog
                visible={dialogVisible}
                style={{ width: '32rem' }}
                header={editando ? 'Editar tarea' : 'Nueva tarea'}
                modal
                className="p-fluid"
                onHide={cerrarDialog}
                footer={
                    <>
                        {editando && <Button label="Eliminar" icon="pi pi-trash" severity="danger" text onClick={() => eliminar(editando)} />}
                        <Button label="Cancelar" icon="pi pi-times" text onClick={cerrarDialog} />
                        <Button label="Guardar" icon="pi pi-check" loading={guardando} onClick={guardar} />
                    </>
                }
            >
                <div className="field">
                    <label htmlFor="tarea-titulo">Título *</label>
                    <InputText
                        id="tarea-titulo"
                        value={form.titulo}
                        onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                        className={submitted && !form.titulo?.trim() ? 'p-invalid' : ''}
                        autoFocus
                    />
                    {submitted && !form.titulo?.trim() && <small className="p-error">El título es obligatorio.</small>}
                </div>
                <div className="field">
                    <label htmlFor="tarea-desc">Descripción</label>
                    <InputTextarea id="tarea-desc" value={form.descripcion ?? ''} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} />
                </div>
                <div className="formgrid grid">
                    <div className="field col-6">
                        <label htmlFor="tarea-estado">Estado</label>
                        <Dropdown
                            id="tarea-estado"
                            value={form.estado}
                            options={COLUMNAS.map((c) => ({ label: c.titulo, value: c.estado }))}
                            onChange={(e) => setForm({ ...form, estado: e.value })}
                        />
                    </div>
                    <div className="field col-6">
                        <label htmlFor="tarea-prioridad">Prioridad</label>
                        <Dropdown
                            id="tarea-prioridad"
                            value={form.prioridad}
                            options={PRIORIDADES}
                            onChange={(e) => setForm({ ...form, prioridad: e.value })}
                        />
                    </div>
                </div>
                <div className="field">
                    <label htmlFor="tarea-fecha">Fecha límite</label>
                    <Calendar
                        id="tarea-fecha"
                        value={form.fecha_limite ? new Date(form.fecha_limite + 'T00:00:00') : null}
                        onChange={(e) => {
                            const fecha = e.value as Date | null;
                            setForm({ ...form, fecha_limite: fecha ? fecha.toISOString().slice(0, 10) : null });
                        }}
                        dateFormat="dd/mm/yy"
                        showIcon
                    />
                </div>
            </Dialog>
        </div>
    );
};

export default AgendaKanban;
