import { supabase } from '../superbase.service';
import { fetchAllRows } from './supabasePagination';

export interface Viaje {
    id?: number;
    id_cliente: number | null;
    cliente_nombre?: string;
    fecha: string;
    folio_bco: string;
    folio: string;
    origen?: string;
    destino?: string;
    id_precio_origen_destino: number | null;
    id_material: number | null;
    material_nombre?: string;
    id_m3: number | null;
    m3_nombre?: string;
    caphrsviajes: number | null;
    id_operador?: number | null;
    operador_nombre?: string; 
    id_invitado?: string | null;
    invitado_nombre?: string; 
    en_renta: boolean;
    horas_renta: number | null;
    horario?: string; 
    numero_viaje?: number | null;
    cantidad_viajes?: number | null;
    total_materia?: number | null;
    observaciones?: string | null;
    estatus?: EstatusViaje | null;
    // Foto del ticket de carga (ruta dentro del bucket privado 'tickets-viaje').
    // La toma el operador desde la app móvil o se sube aquí en la web.
    foto_ticket?: string | null;
    foto_ticket_at?: string | null;
}

// Flujo de facturación del viaje: se define después de creado, así que puede
// quedar vacío (null) hasta que alguien lo avance manualmente.
export type EstatusViaje = 'estimado' | 'aprobado' | 'facturado' | 'pagado';

// Helper function to transform Supabase response to Viaje interface
const transformViajeData = (data: any): Viaje => ({
    id: data.id,
    id_cliente: data.id_cliente,
    cliente_nombre: data.clientes?.cliente_nombre || '',
    fecha: data.fecha,
    folio_bco: data.folio_bco,
    folio: data.folio,
    origen: data.precio_origen_destino?.origen || '',
    destino: data.precio_origen_destino?.destino || '',
    id_precio_origen_destino: data.id_precio_origen_destino,
    id_material: data.id_material,
    material_nombre: data.material?.material_nombre || '',
    id_m3: data.id_m3,
    m3_nombre: data.m3?.m3_nombre || '',
    caphrsviajes: data.caphrsviajes,
    id_operador: data.id_operador,
    operador_nombre: data.operador?.nombre || '',
    id_invitado: data.id_invitado || null,
    invitado_nombre: data.invitados?.empresa || '',
    en_renta: data.en_renta || false,
    horas_renta: data.horas_renta,
    horario: 'D',
    numero_viaje: data.numero_viaje || null,
    cantidad_viajes: data.cantidad_viajes || null,
    total_materia: data.total_materia || null,
    observaciones: data.observaciones || null,
    estatus: data.estatus || null
});

export const fetchViajes = async (): Promise<Viaje[]> => {
    try {
        return await fetchAllRows<Viaje>((sb, from, to) =>
            sb.from('fetch_viajes')
              .select('*')
              .order('id', { ascending: false })
              .range(from, to)
        );
    } catch (error) {
        console.error('Error fetching viajes:', error);
        throw error;
    }
};

// La vista `fetch_viajes` no siempre trae los ids crudos (id_cliente, id_material, etc.),
// solo los nombres ya resueltos para mostrar en la tabla. Para editar necesitamos los ids
// reales, así que se leen directo de la tabla `viajes`, que es la misma que usan
// createViaje/updateViaje.
export const fetchViajeById = async (id: number): Promise<Viaje> => {
    const { data, error } = await supabase
        .from('viajes')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching viaje por id:', error);
        throw error;
    }

    return data as Viaje;
};

// ---------------------------------------------------------------------------
// Foto del ticket de carga (opcional). Necesita el script
// App_Movil_Tsa/app/scripts/ticket_viaje_setup.sql: columnas foto_ticket y
// foto_ticket_at en `viajes` y el bucket privado 'tickets-viaje'.
//
// Mientras el viaje está en logística, la app móvil guarda la foto como
// tickets-viaje/logistica/<id de logistica>.jpg. Al aprobarlo (LogisticaAdmin),
// buscarTicketDeLogistica la encuentra y su ruta se copia al registro nuevo de
// viajes, porque el de logística se borra.
// ---------------------------------------------------------------------------
const BUCKET_TICKETS = 'tickets-viaje';

export interface TicketViaje {
    foto_ticket: string;
    foto_ticket_at: string | null;
}

// Regresa null si no hay foto o si el bucket todavía no existe: aprobar sigue
// funcionando igual, la foto nunca es obligatoria.
export const buscarTicketDeLogistica = async (idLogistica: number): Promise<TicketViaje | null> => {
    const nombre = `${idLogistica}.jpg`;
    const { data, error } = await supabase.storage.from(BUCKET_TICKETS).list('logistica', { search: nombre, limit: 10 });

    if (error) {
        console.warn('No se pudo buscar el ticket del viaje:', error.message);
        return null;
    }

    const archivo = data?.find((a) => a.name === nombre);
    if (!archivo) return null;

    return {
        foto_ticket: `logistica/${nombre}`,
        foto_ticket_at: archivo.updated_at || archivo.created_at || null
    };
};

// URL temporal (1 hora) para ver una foto del bucket privado.
export const urlTicket = async (ruta: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(BUCKET_TICKETS).createSignedUrl(ruta, 3600);
    if (error) {
        console.error('Error generando URL del ticket:', error);
        return null;
    }
    return data?.signedUrl || null;
};

export const fetchTicketDeViaje = async (idViaje: number): Promise<TicketViaje | null> => {
    const { data, error } = await supabase.from('viajes').select('foto_ticket, foto_ticket_at').eq('id', idViaje).maybeSingle();

    if (error) {
        console.error('Error obteniendo ticket del viaje:', error);
        throw error;
    }
    return data?.foto_ticket ? { foto_ticket: data.foto_ticket, foto_ticket_at: data.foto_ticket_at } : null;
};

// Sube (o reemplaza) la foto de un viaje que sigue en logística, en la misma
// ruta que usa la app móvil, para que al aprobarlo pase sola a `viajes`.
export const subirTicketDeLogistica = async (idLogistica: number, archivo: File): Promise<TicketViaje> => {
    const ruta = `logistica/${idLogistica}.jpg`;
    const { error } = await supabase.storage.from(BUCKET_TICKETS).upload(ruta, archivo, { contentType: archivo.type || 'image/jpeg', upsert: true });
    if (error) {
        console.error('Error subiendo ticket del viaje en logística:', error);
        throw error;
    }
    return { foto_ticket: ruta, foto_ticket_at: new Date().toISOString() };
};

// Sube (o reemplaza) la foto del ticket de un viaje ya aprobado desde la web.
export const subirTicketDeViaje = async (idViaje: number, archivo: File): Promise<TicketViaje> => {
    const extension = (archivo.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const ruta = `viajes/${idViaje}_${Date.now()}.${extension}`;

    const { error: errorSubida } = await supabase.storage.from(BUCKET_TICKETS).upload(ruta, archivo, { contentType: archivo.type || 'image/jpeg' });
    if (errorSubida) {
        console.error('Error subiendo ticket del viaje:', errorSubida);
        throw errorSubida;
    }

    const ticket = { foto_ticket: ruta, foto_ticket_at: new Date().toISOString() };
    const { error } = await supabase.from('viajes').update(ticket).eq('id', idViaje);
    if (error) {
        console.error('Error guardando ticket del viaje:', error);
        throw error;
    }
    return ticket;
};

export const createViaje = async (viaje: Omit<Viaje, 'id'>): Promise<Viaje> => {
    const { data, error } = await supabase
        .from('viajes')
        .insert([viaje])
        .select('*')
        .single();

    if (error) {
        console.error('Error creating viaje:', error);
        throw error;
    }

    return transformViajeData(data);
};

// Nota: la cuenta por pagar del invitado ya no se acumula aquí de forma incremental.
// Su saldo se recalcula dinámicamente a partir de los viajes vinculados y su
// porcentaje de participación cada vez que se consulta (ver fetchCuentasInvitado en
// CxPService.ts), igual que el saldo de Cuentas por Cobrar se recalcula desde los
// viajes del cliente. Esto evita que la cuenta quede desactualizada si el % del
// invitado se define después, o si el viaje no trae montos al momento de crearse.

export const updateViaje = async (viaje: Viaje): Promise<Viaje> => {
    const { data, error } = await supabase
        .from('viajes')
        .update({
            id_cliente: viaje.id_cliente,
            fecha: viaje.fecha,
            folio_bco: viaje.folio_bco,
            folio: viaje.folio,
            id_precio_origen_destino: viaje.id_precio_origen_destino,
            id_material: viaje.id_material,
            id_m3: viaje.id_m3,
            caphrsviajes: viaje.caphrsviajes,
            id_operador: viaje.id_operador,
            id_invitado: viaje.id_invitado,
            en_renta: viaje.en_renta,
            horas_renta: viaje.horas_renta,
            horario: viaje.horario,
            numero_viaje: viaje.numero_viaje,
            cantidad_viajes: viaje.cantidad_viajes,
            total_materia: viaje.total_materia,
            observaciones: viaje.observaciones,
            estatus: viaje.estatus
        })
        .eq('id', viaje.id)
        .select('*')
        .single();

    if (error) {
        console.error('Error updating viaje:', error);
        throw error;
    }

    return transformViajeData(data);
};

export const deleteViaje = async (id: number): Promise<void> => {
    const { error } = await supabase
        .from('viajes')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting viaje:', error);
        throw error;
    }
};

// New helper functions to fetch dropdown options
export const fetchClientes = async (): Promise<{ id: number; empresa: string }[]> => {
    const { data, error } = await supabase.from('clientes').select('id, empresa').eq('estatus', 1); // solo clientes Activos
    if (error) throw error;
    return data || [];
};

export const fetchPreciosOrigenDestino = async (): Promise<{ id: number; label: string; origen: string; destino: string; precio_unidad: number; precio_materia?: number }[]> => {
    const { data, error } = await supabase.from('precio_origen_destino').select('id, nombreorigen, nombredestino, precio_unidad, precio_materia').eq('status', true);
    if (error) throw error;
    return data?.map(item => ({
        id: item.id,
        label: `${item.nombreorigen} - ${item.nombredestino}`,
        origen: item.nombreorigen,
        destino: item.nombredestino,
        precio_unidad: item.precio_unidad,
        precio_materia: item.precio_materia ?? 0
    })) || [];
};


export const fetchMateriales = async (): Promise<{ id: number; nombre: string }[]> => {
    const { data, error } = await supabase.from('material').select('id, nombre');
    if (error) throw error;
    return data || [];
};

export const fetchM3 = async (): Promise<{ id: number; nombre: string; metros_cubicos: number }[]> => {
    const { data, error } = await supabase.from('m3').select('id, nombre, metros_cubicos');
    if (error) throw error;
    return data || [];
};

//obtener los viajes de los clientes cargados, para el resuemn de CXC
// No incluye los viajes en estatus "pagado": ya se facturaron y se cobraron,
// así que no deben seguir apareciendo en lo que el cliente todavía debe.
export const fetchViajesPorCliente = async (id_cliente: number): Promise<any[]> => {
    const { data, error } = await supabase
        .from('viajes')
        .select(`
            id,
            fecha,
            folio_bco,
            folio,
            caphrsviajes,
            total_materia,
            estatus
        `)
        .eq('id_cliente', id_cliente)
        // ojo: usar .neq('estatus', 'pagado') excluiría también los viajes con estatus
        // NULL (la mayoría, mientras no se les asigne uno), porque en SQL "NULL <> 'pagado'"
        // no es verdadero. Por eso se listan explícitamente los valores que sí se deben
        // incluir en vez de excluir solo "pagado".
        .or('estatus.is.null,estatus.eq.estimado,estatus.eq.aprobado,estatus.eq.facturado')
        .order('fecha', { ascending: false });

    if (error) throw error;

    return data || [];
};

//obtener los viajes vinculados a un invitado, para el resumen de CxP
export const fetchViajesPorInvitado = async (id_invitado: number): Promise<any[]> => {
    const { data, error } = await supabase
        .from('viajes')
        .select(`
            id,
            fecha,
            folio_bco,
            folio,
            caphrsviajes,
            total_materia
        `)
        .eq('id_invitado', String(id_invitado))
        .order('fecha', { ascending: false });

    if (error) throw error;

    return data || [];
};

export const fetchOperadores = async (): Promise<{id: number; nombre: string}[]> => {
    const { data, error } = await supabase
        .from('operador')
        .select('id, nombre');
    if (error) throw error;
    return data || [];
};

export const fetchInvitados = async (): Promise<{ id: number; empresa: string }[]> => {
    const { data, error } = await supabase
        .from('invitados')
        .select('id, empresa')
        .eq('estatus', 1); // Solo activos
    
    if (error) throw error;
    return data || [];
};

// Revisa cuáles de los folios recibidos ya existen en la base de datos (para la carga masiva,
// en lugar de checar uno por uno como hace checkFolioExists).
export const checkFoliosExisten = async (folios: string[]): Promise<Set<string>> => {
    if (folios.length === 0) return new Set();
    const { data, error } = await supabase
        .from('viajes')
        .select('folio')
        .in('folio', folios);

    if (error) {
        console.error('Error al verificar folios:', error);
        throw error;
    }

    return new Set((data || []).map(d => d.folio));
};

// Inserta varios viajes de una sola vez (carga masiva desde Excel).
export const createViajesBulk = async (viajes: Omit<Viaje, 'id'>[]): Promise<Viaje[]> => {
    if (viajes.length === 0) return [];
    const { data, error } = await supabase
        .from('viajes')
        .insert(viajes)
        .select('*');

    if (error) {
        console.error('Error en la carga masiva de viajes:', error);
        throw error;
    }

    return (data || []).map(transformViajeData);
};

export interface ViajeIdentificado {
    id: number;
    folio: string | null;
    folio_bco: string | null;
    estatus: EstatusViaje | null;
}

// Busca viajes por Folio y/o Folio BCO (usado al re-subir el Excel exportado
// de Estimaciones, para ubicar a qué viaje corresponde cada fila).
export const fetchViajesPorIdentificadores = async (folios: string[], foliosBco: string[]): Promise<ViajeIdentificado[]> => {
    const encontrados = new Map<number, ViajeIdentificado>();

    if (folios.length > 0) {
        const { data, error } = await supabase
            .from('viajes')
            .select('id, folio, folio_bco, estatus')
            .in('folio', folios);
        if (error) throw error;
        (data || []).forEach(v => encontrados.set(v.id, v));
    }

    if (foliosBco.length > 0) {
        const { data, error } = await supabase
            .from('viajes')
            .select('id, folio, folio_bco, estatus')
            .in('folio_bco', foliosBco);
        if (error) throw error;
        (data || []).forEach(v => encontrados.set(v.id, v));
    }

    return Array.from(encontrados.values());
};

// Actualiza el estatus de varios viajes a la vez (usado desde Estimaciones,
// donde se seleccionan varios viajes de un cliente y se cambian de golpe).
export const updateViajesEstatusBulk = async (ids: number[], estatus: EstatusViaje): Promise<void> => {
    if (ids.length === 0) return;
    const { error } = await supabase
        .from('viajes')
        .update({ estatus })
        .in('id', ids);

    if (error) {
        console.error('Error actualizando el estatus de los viajes:', error);
        throw error;
    }
};

export const checkFolioExists = async (folio: string): Promise<boolean> => {
    try {
        const { data, error } = await supabase
            .from('viajes')
            .select('id')
            .eq('folio', folio)
            .maybeSingle(); // Usamos maybeSingle para evitar errores cuando no hay resultados

        if (error) {
            console.error('Error al verificar folio:', error);
            return false;
        }

        // Si data es null, no existe el folio
        // Si data tiene un objeto, significa que existe
        return data !== null;
    } catch (error) {
        console.error('Error al verificar folio:', error);
        return false;
    }
};