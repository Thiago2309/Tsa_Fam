import { supabase } from '../superbase.service';
import { fetchAllRows } from './supabasePagination';

export interface CajaChica {
    id?: number; //Se agrega el ? para que no lo tome Ts y lo mande
    fecha: string;
    descripcion: string;
    ingreso: number | null;
    egreso: number | null;
}

// Helper function to transform Supabase response to CajaChica interface
const transformCajaChicaData = (data: any): CajaChica => ({
    id: data.id,
    fecha: data.fecha,
    descripcion: data.descripcion,
    ingreso: data.ingreso,
    egreso: data.egreso,
});

// Se pagina con fetchAllRows: sin esto PostgREST corta en 1000 filas y el saldo general sale incompleto.
export const fetchCajaChica = async (): Promise<CajaChica[]> => {
    try {
        const data = await fetchAllRows<any>((query, from, to) =>
            query
                .from('fetch_caja_chica') // del view que se creo en la base de datos
                .select('*')
                .order('fecha', { ascending: true })
                .order('id', { ascending: true })
                .range(from, to)
        );
        return data.map(transformCajaChicaData);
    } catch (error) {
        console.error('Error fetching Caja Chica:', error);
        throw error;
    }
};

export const createCajaChica = async (cajaChica: Omit<CajaChica, 'id'>): Promise<CajaChica> => {
    console.log("Datos enviados a Supabase:", cajaChica);

    const { data, error } = await supabase
        .from('cajachica')
        .insert([cajaChica])
        .select('*')
        .single();

    if (error) {
        console.error('Error creating Caja Chica:', error);
        throw error;
    }

    return transformCajaChicaData(data);
};

export const updateCajaChica = async (cajaChica: CajaChica): Promise<CajaChica> => {
    const { data, error } = await supabase
        .from('cajachica')
        .update({
            fecha: cajaChica.fecha,
            descripcion: cajaChica.descripcion,
            ingreso: cajaChica.ingreso,
            egreso: cajaChica.egreso
        })
        .eq('id', cajaChica.id)
        .select('*')
        .single();

    if (error) {
        console.error('Error updating Caja Chica:', error);
        throw error;
    }

    return transformCajaChicaData(data);
};

export const deleteCajaChica = async (id: number): Promise<void> => {
    const { error } = await supabase
        .from('cajachica')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting Caja Chica:', error);
        throw error;
    }
};