// Services/BD/agendaService.ts
import { supabase } from '../superbase.service';

export type TipoEvento = 'reunion' | 'conferencia' | 'llamada' | 'otro';
export type EstadoEvento = 'programado' | 'completado' | 'cancelado';
export type EstadoTarea = 'pendiente' | 'en_proceso' | 'finalizado' | 'cancelado';
export type PrioridadTarea = 'baja' | 'media' | 'alta';

export interface AgendaEvento {
    id: number | null;
    userid: number;
    creado_por: number;
    titulo: string;
    descripcion?: string | null;
    tipo: TipoEvento;
    fecha_inicio: string; // ISO
    fecha_fin: string; // ISO
    ubicacion?: string | null;
    estado: EstadoEvento;
    color?: string | null;
    // campos resueltos, no vienen de la tabla base
    usuario_nombre?: string;
    creado_por_nombre?: string;
}

export interface AgendaTarea {
    id: number | null;
    userid: number;
    titulo: string;
    descripcion?: string | null;
    estado: EstadoTarea;
    prioridad: PrioridadTarea;
    fecha_limite?: string | null; // YYYY-MM-DD
    orden: number;
}

export interface UsuarioSimple {
    id: number;
    nombre: string;
    apellido: string;
}

const transformEvento = (data: any): AgendaEvento => ({
    id: data.id,
    userid: data.userid,
    creado_por: data.creado_por,
    titulo: data.titulo,
    descripcion: data.descripcion,
    tipo: data.tipo,
    fecha_inicio: data.fecha_inicio,
    fecha_fin: data.fecha_fin,
    ubicacion: data.ubicacion,
    estado: data.estado,
    color: data.color,
    usuario_nombre: data.usuario_nombre ?? undefined,
    creado_por_nombre: data.creado_por_nombre ?? undefined
});

const transformTarea = (data: any): AgendaTarea => ({
    id: data.id,
    userid: data.userid,
    titulo: data.titulo,
    descripcion: data.descripcion,
    estado: data.estado,
    prioridad: data.prioridad,
    fecha_limite: data.fecha_limite,
    orden: data.orden
});

// ---------------------------------------------------------------------------
// Eventos (calendario)
// ---------------------------------------------------------------------------

export const fetchEventosDeUsuario = async (userid: number): Promise<AgendaEvento[]> => {
    const { data, error } = await supabase
        .from('fetch_agenda_eventos')
        .select('*')
        .eq('userid', userid)
        .order('fecha_inicio', { ascending: true });

    if (error) {
        console.error('Error obteniendo eventos de agenda:', error);
        throw error;
    }

    return (data || []).map(transformEvento);
};

export const fetchTodosLosEventos = async (): Promise<AgendaEvento[]> => {
    const { data, error } = await supabase
        .from('fetch_agenda_eventos')
        .select('*')
        .order('fecha_inicio', { ascending: true });

    if (error) {
        console.error('Error obteniendo todos los eventos de agenda:', error);
        throw error;
    }

    return (data || []).map(transformEvento);
};

export const createEvento = async (evento: Omit<AgendaEvento, 'id' | 'usuario_nombre' | 'creado_por_nombre'>): Promise<AgendaEvento> => {
    const { data, error } = await supabase
        .from('agenda_eventos')
        .insert([{
            userid: evento.userid,
            creado_por: evento.creado_por,
            titulo: evento.titulo,
            descripcion: evento.descripcion ?? null,
            tipo: evento.tipo,
            fecha_inicio: evento.fecha_inicio,
            fecha_fin: evento.fecha_fin,
            ubicacion: evento.ubicacion ?? null,
            estado: evento.estado,
            color: evento.color ?? null
        }])
        .select()
        .single();

    if (error) {
        console.error('Error creando evento de agenda:', error);
        throw error;
    }

    return transformEvento(data);
};

export const updateEvento = async (id: number, evento: Partial<Omit<AgendaEvento, 'id' | 'usuario_nombre' | 'creado_por_nombre'>>): Promise<AgendaEvento> => {
    const { data, error } = await supabase
        .from('agenda_eventos')
        .update({
            titulo: evento.titulo,
            descripcion: evento.descripcion ?? null,
            tipo: evento.tipo,
            fecha_inicio: evento.fecha_inicio,
            fecha_fin: evento.fecha_fin,
            ubicacion: evento.ubicacion ?? null,
            estado: evento.estado,
            color: evento.color ?? null
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error actualizando evento de agenda:', error);
        throw error;
    }

    return transformEvento(data);
};

export const deleteEvento = async (id: number): Promise<void> => {
    const { error } = await supabase.from('agenda_eventos').delete().eq('id', id);
    if (error) {
        console.error('Error eliminando evento de agenda:', error);
        throw error;
    }
};

// ---------------------------------------------------------------------------
// Tareas (kanban)
// ---------------------------------------------------------------------------

export const fetchTareasDeUsuario = async (userid: number): Promise<AgendaTarea[]> => {
    const { data, error } = await supabase
        .from('agenda_tareas')
        .select('*')
        .eq('userid', userid)
        .order('orden', { ascending: true });

    if (error) {
        console.error('Error obteniendo tareas de agenda:', error);
        throw error;
    }

    return (data || []).map(transformTarea);
};

export const createTarea = async (tarea: Omit<AgendaTarea, 'id'>): Promise<AgendaTarea> => {
    const { data, error } = await supabase
        .from('agenda_tareas')
        .insert([{
            userid: tarea.userid,
            titulo: tarea.titulo,
            descripcion: tarea.descripcion ?? null,
            estado: tarea.estado,
            prioridad: tarea.prioridad,
            fecha_limite: tarea.fecha_limite ?? null,
            orden: tarea.orden
        }])
        .select()
        .single();

    if (error) {
        console.error('Error creando tarea de agenda:', error);
        throw error;
    }

    return transformTarea(data);
};

export const updateTarea = async (id: number, tarea: Partial<Omit<AgendaTarea, 'id' | 'userid'>>): Promise<AgendaTarea> => {
    const payload: Record<string, any> = {};
    if (tarea.titulo !== undefined) payload.titulo = tarea.titulo;
    if (tarea.descripcion !== undefined) payload.descripcion = tarea.descripcion;
    if (tarea.estado !== undefined) payload.estado = tarea.estado;
    if (tarea.prioridad !== undefined) payload.prioridad = tarea.prioridad;
    if (tarea.fecha_limite !== undefined) payload.fecha_limite = tarea.fecha_limite;
    if (tarea.orden !== undefined) payload.orden = tarea.orden;

    const { data, error } = await supabase.from('agenda_tareas').update(payload).eq('id', id).select().single();

    if (error) {
        console.error('Error actualizando tarea de agenda:', error);
        throw error;
    }

    return transformTarea(data);
};

export const reordenarTareas = async (cambios: { id: number; estado: EstadoTarea; orden: number }[]): Promise<void> => {
    await Promise.all(
        cambios.map(({ id, estado, orden }) => supabase.from('agenda_tareas').update({ estado, orden }).eq('id', id))
    );
};

export const deleteTarea = async (id: number): Promise<void> => {
    const { error } = await supabase.from('agenda_tareas').delete().eq('id', id);
    if (error) {
        console.error('Error eliminando tarea de agenda:', error);
        throw error;
    }
};

// ---------------------------------------------------------------------------
// Personal (para que Admin pueda elegir a quién agendarle una reunión)
// ---------------------------------------------------------------------------

export const fetchUsuariosParaAgenda = async (): Promise<UsuarioSimple[]> => {
    const { data, error } = await supabase.from('user').select('id, nombre, apellido').order('nombre');

    if (error) {
        console.error('Error obteniendo usuarios para agenda:', error);
        throw error;
    }

    return data || [];
};
