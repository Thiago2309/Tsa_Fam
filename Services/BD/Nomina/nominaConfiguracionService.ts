import { supabase } from '../../superbase.service';

export interface NominaConfiguracion {
  id?: number;
  meta_rebase: number;                // Monto que debe rebasar el operador
  porcentaje_diurno: number;          // % aplicado si solo tiene viajes diurnos ('D')
  porcentaje_nocturno_mixto: number;  // % aplicado si tiene viajes nocturnos ('N') o mixtos
  updated_at?: string;
}

// Valores por defecto (los que estaban fijos en código) por si no existe registro
export const NOMINA_CONFIG_DEFAULT: NominaConfiguracion = {
  meta_rebase: 40000,
  porcentaje_diurno: 12,
  porcentaje_nocturno_mixto: 15
};

const transformNominaConfiguracionData = (row: any): NominaConfiguracion => ({
  id: row.id,
  meta_rebase: Number(row.meta_rebase ?? NOMINA_CONFIG_DEFAULT.meta_rebase),
  porcentaje_diurno: Number(row.porcentaje_diurno ?? NOMINA_CONFIG_DEFAULT.porcentaje_diurno),
  porcentaje_nocturno_mixto: Number(row.porcentaje_nocturno_mixto ?? NOMINA_CONFIG_DEFAULT.porcentaje_nocturno_mixto),
  updated_at: row.updated_at
});

export const fetchNominaConfiguracion = async (): Promise<NominaConfiguracion> => {
  const { data, error } = await supabase
    .from('nomina_configuracion')
    .select('*')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { ...NOMINA_CONFIG_DEFAULT };

  return transformNominaConfiguracionData(data);
};

export const saveNominaConfiguracion = async (config: NominaConfiguracion): Promise<NominaConfiguracion> => {
  const payload = {
    meta_rebase: config.meta_rebase,
    porcentaje_diurno: config.porcentaje_diurno,
    porcentaje_nocturno_mixto: config.porcentaje_nocturno_mixto,
    updated_at: new Date().toISOString()
  };

  const { data, error } = config.id
    ? await supabase.from('nomina_configuracion').update(payload).eq('id', config.id).select('*').single()
    : await supabase.from('nomina_configuracion').insert([payload]).select('*').single();

  if (error) throw error;

  return transformNominaConfiguracionData(data);
};
