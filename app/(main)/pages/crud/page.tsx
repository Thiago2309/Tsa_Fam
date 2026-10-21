'use client';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Toast } from 'primereact/toast';
import { Toolbar } from 'primereact/toolbar';
import { Dropdown } from 'primereact/dropdown'; // Import Dropdown
import { Calendar } from 'primereact/calendar';
import { FileUpload, FileUploadHandlerEvent } from 'primereact/fileupload';
import { Tag } from 'primereact/tag';
import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    fetchViajes,
    fetchViajeById,
    createViaje,
    updateViaje,
    deleteViaje,
    createViajesBulk,
    checkFoliosExisten,
    Viaje,
    fetchClientes,
    fetchPreciosOrigenDestino,
    fetchMateriales,
    fetchM3,
    fetchOperadores,
    checkFolioExists,
    fetchInvitados
} from '../../../../Services/BD/viajeService';
import TicketViajeDialog from './TicketViajeDialog';
import { DataTableFilterMeta } from 'primereact/datatable';
import { InputNumber } from 'primereact/inputnumber';
import { Checkbox } from 'primereact/checkbox';
import { 
  fetchClientesConViajesUltraRapido as fetchClientesConViajes, 
  fetchViajesConFiltrosOptimizado as fetchViajesConFiltros,
  exportarEstimacionExcel, 
  fetchOpcionesFiltros, 
  EstimacionCliente, 
  ViajeEstimacion, 
  FiltrosEstimacion 
} from '../../../../Services/BD/estimacionesService';

// Normaliza ids para que el value del Dropdown y sus options coincidan en tipo
// (Supabase puede devolver columnas bigint como string, mientras las opciones
// de los combos vienen tipadas como number, lo que hace que el Dropdown no
// muestre la selección aunque el dato sí esté presente).
const normalizeId = (v: any): number | string | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? v : n;
};

const OPCIONES_ESTATUS_FILTRO = [
    { label: 'Estimado', value: 'estimado' },
    { label: 'Aprobado', value: 'aprobado' },
    { label: 'Facturado', value: 'facturado' },
    { label: 'Pagado', value: 'pagado' },
    { label: 'Sin estatus', value: '__sin_estatus__' }
];

// Encabezados esperados en el Excel de carga masiva (ver también la plantilla descargable)
const COLUMNAS_PLANTILLA_CARGA = [
    'Fecha', 'Cliente', 'Origen', 'Destino', 'Material', 'M3', 'M3 (manual)',
    'Operador', 'Invitado', 'Folio', 'Folio Banco', 'Horario',
    'Numero de Viaje', 'Cantidad de Viajes', 'En Renta', 'Horas de Renta', 'Observaciones'
];

const FILA_EJEMPLO_PLANTILLA_CARGA = {
    'Fecha': '2026-01-15',
    'Cliente': 'Nombre exacto del cliente',
    'Origen': 'Nombre exacto del origen',
    'Destino': 'Nombre exacto del destino',
    'Material': 'Nombre exacto del material',
    'M3': 'Nombre exacto del M3 (deja vacío si usas "M3 (manual)")',
    'M3 (manual)': '',
    'Operador': '',
    'Invitado': '',
    'Folio': '',
    'Folio Banco': '',
    'Horario': 'D',
    'Numero de Viaje': '',
    'Cantidad de Viajes': '',
    'En Renta': 'No',
    'Horas de Renta': '',
    'Observaciones': ''
};

interface FilaCargaMasiva {
    fila: number; // número de fila en el Excel (incluye encabezado, 1-indexed)
    textoOriginal: {
        cliente: string;
        origen: string;
        destino: string;
        material: string;
        m3: string;
        operador: string;
        invitado: string;
    };
    datos: Omit<Viaje, 'id'>;
    errores: string[];
}

const normalizarTexto = (v: any): string => String(v ?? '').trim();

const normalizarTextoComparacion = (v: any): string =>
    normalizarTexto(v)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, ''); // quita acentos para comparar de forma más tolerante

const buscarPorNombre = <T extends Record<string, any>>(lista: T[], campo: keyof T, valor: string): T | undefined => {
    const objetivo = normalizarTextoComparacion(valor);
    if (!objetivo) return undefined;
    return lista.find(item => normalizarTextoComparacion(item[campo]) === objetivo);
};

const parseFechaExcel = (valor: any): string | null => {
    if (valor === null || valor === undefined || valor === '') return null;
    if (valor instanceof Date && !isNaN(valor.getTime())) {
        return `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(valor.getDate()).padStart(2, '0')}`;
    }
    const texto = normalizarTexto(valor);
    let m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // YYYY-MM-DD
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/YYYY
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
};

const parseSiNo = (valor: any): boolean => {
    const texto = normalizarTextoComparacion(valor);
    return texto === 'si' || texto === 'sí' || texto === 'true' || texto === '1' || texto === 'x';
};

const parseHorario = (valor: any): string => {
    const texto = normalizarTextoComparacion(valor);
    if (texto === 'n' || texto === 'noche') return 'N';
    return 'D';
};

const parseNumeroOpcional = (valor: any): number | null => {
    if (valor === null || valor === undefined || valor === '') return null;
    const n = Number(valor);
    return Number.isNaN(n) ? null : n;
};

const Crud = () => {
    let emptyViaje: Viaje = {
        id_cliente: null,
        fecha: '',
        folio_bco: '',
        folio: '',
        id_precio_origen_destino: null,
        id_material: null,
        id_m3: null,
        caphrsviajes: null,
        id_operador: null,
        operador_nombre: '',
        en_renta: false,
        horas_renta: null,
        id_invitado: null,
        numero_viaje: null,
        cantidad_viajes: null,
        observaciones: null
    };

    const [viajes, setViajes] = useState<Viaje[]>([]);
    const [viajeDialog, setViajeDialog] = useState(false);
    const [deleteViajeDialog, setDeleteViajeDialog] = useState(false);
    const [deleteViajesDialog, setDeleteViajesDialog] = useState(false);
    const [viaje, setViaje] = useState<Viaje>(emptyViaje);
    // Viaje cuya foto del ticket de carga se está viendo (null = ventana cerrada)
    const [ticketDe, setTicketDe] = useState<Viaje | null>(null);
    const [selectedViajes, setSelectedViajes] = useState<Viaje[]>([]);
    const [submitted, setSubmitted] = useState(false);
    const [filters, setFilters] = useState<DataTableFilterMeta>({
            global: { value: null, matchMode: 'contains' as const }
        });
    const toast = useRef<Toast>(null);
    const dt = useRef<DataTable<any>>(null);

    // State for dropdown options
    const [clientes2, setClientes2] = useState<{ id: number; empresa: string }[]>([]);
    const [preciosOrigenDestino, setPreciosOrigenDestino] = useState<{ id: number; label: string; origen: string; destino: string; precio_unidad: number }[]>([]);
    const [m3Options, setM3Options] = useState<{ id: number; nombre: string; metros_cubicos: number }[]>([]);
    const [materiales, setMateriales] = useState<{ id: number; nombre: string }[]>([]);
    const [operadores, setOperadores] = useState<{id: number; nombre: string}[]>([]);
    const [folioError, setFolioError] = useState(false);
    const [invitados, setInvitados] = useState<{ id: number; empresa: string }[]>([]);
    const [clientes, setClientes] = useState<EstimacionCliente[]>([]);

    const [filtros, setFiltros] = useState<FiltrosEstimacion>({
        fechaInicio: null,
        fechaFin: null,
        clienteId: null,
        operador: null,
        material: null,
        origen: null,
        destino: null,
        estatus: null
    });
    const [opcionesFiltros, setOpcionesFiltros] = useState<{operadores: string[], materiales: string[], origenes: string[], destinos: string[]}>({
        operadores: [],
        materiales: [],
        origenes: [],
        destinos: []
        });
    const [showFiltros, setShowFiltros] = useState(false);
    const [loading, setLoading] = useState({ viajes: false });
    const [filteredViajes, setFilteredViajes] = useState<Viaje[]>([]);

    // Estado para la carga masiva de viajes desde Excel
    const [cargaMasivaDialog, setCargaMasivaDialog] = useState(false);
    const [filasCarga, setFilasCarga] = useState<FilaCargaMasiva[]>([]);
    const [nombreArchivoCarga, setNombreArchivoCarga] = useState('');
    const [procesandoArchivo, setProcesandoArchivo] = useState(false);
    const [guardandoCarga, setGuardandoCarga] = useState(false);

    const aplicarFiltros = () => {
    setLoading({ ...loading, viajes: true });
    console.log('Aplicando filtros:', filtros);
    console.log('Viajes totales:', viajes.length, 'primeros 3:', viajes.slice(0,3));

    try {
        let resultados = viajes.slice();

        // Filtrar por rango de fechas - USANDO STRINGS PARA COMPARAR
        if (filtros.fechaInicio && filtros.fechaFin) {
            const inicioStr = filtros.fechaInicio.toISOString().split('T')[0];
            const finStr = filtros.fechaFin.toISOString().split('T')[0];
            
            resultados = resultados.filter(v => {
                // Extraer solo la fecha en formato YYYY-MM-DD
                const fechaViajeStr = v.fecha.split('T')[0] || v.fecha;
                return fechaViajeStr >= inicioStr && fechaViajeStr <= finStr;
            });
        } else if (filtros.fechaInicio) {
            const inicioStr = filtros.fechaInicio.toISOString().split('T')[0];
            resultados = resultados.filter(v => {
                const fechaViajeStr = v.fecha.split('T')[0] || v.fecha;
                return fechaViajeStr >= inicioStr;
            });
        } else if (filtros.fechaFin) {
            const finStr = filtros.fechaFin.toISOString().split('T')[0];
            resultados = resultados.filter(v => {
                const fechaViajeStr = v.fecha.split('T')[0] || v.fecha;
                return fechaViajeStr <= finStr;
            });
        }

        // Filtrar por cliente: algunos objetos `viajes` no contienen `id_cliente`, por eso
        // resolvemos el nombre del cliente desde `clientes2` y comparamos por `cliente_nombre`.
        if (filtros.clienteId) {
            const clienteSeleccionado = clientes2.find(c => c.id === filtros.clienteId);
            if (clienteSeleccionado) {
                const nombreCliente = (clienteSeleccionado.empresa || '').toLowerCase();
                resultados = resultados.filter(v => (v.cliente_nombre || '').toLowerCase() === nombreCliente);
            }
        }

        // Filtrar por operador (coincidencia parcial)
        if (filtros.operador) {
            resultados = resultados.filter(v => (v.operador_nombre || '').toLowerCase().includes(filtros.operador!.toLowerCase()));
        }

        // Filtrar por material
        if (filtros.material) {
            resultados = resultados.filter(v => (v.material_nombre || '').toLowerCase().includes(filtros.material!.toLowerCase()));
        }

        // Filtrar por origen
        if (filtros.origen) {
            resultados = resultados.filter(v => (v.origen || '').toLowerCase().includes(filtros.origen!.toLowerCase()));
        }

        // Filtrar por destino
        if (filtros.destino) {
            resultados = resultados.filter(v => (v.destino || '').toLowerCase().includes(filtros.destino!.toLowerCase()));
        }

        // Filtrar por estatus ("__sin_estatus__" = viajes sin estatus asignado)
        if (filtros.estatus === '__sin_estatus__') {
            resultados = resultados.filter(v => !v.estatus);
        } else if (filtros.estatus) {
            resultados = resultados.filter(v => v.estatus === filtros.estatus);
        }

        console.log('Resultados filtrados:', resultados.length);
        setFilteredViajes(resultados);
        setShowFiltros(false);
    } catch (error) {
        console.error('Error aplicando filtros:', error);
        mostrarError('Error aplicando filtros');
    } finally {
        setLoading({ ...loading, viajes: false });
    }
    };

    const limpiarFiltros = () => {
        setFiltros({
            fechaInicio: null,
            fechaFin: null,
            clienteId: null,
            operador: null,
            material: null,
            origen: null,
            destino: null,
            estatus: null
        });
        setFilteredViajes([]);
    };
    /------------------------------------------------------------------------------------------------------------/

    // Función para calcular el total de horas de viaje
    const calcularTotalHorasViajes = (viajes: Viaje[]): number => {
        return viajes.reduce((total, item) => {
            const horas = item.caphrsviajes || 0; // Si horas_viaje es null, usa 0
            return total + horas;
        }, 0);
    };

    // Función para calcular el total de viajes
    const calcularTotalViajes = (viajes: Viaje[]): number => {
        return viajes.length;
    };

    const isMobile = () => {
        if (typeof window !== 'undefined') {
            return window.innerWidth < 768;
        }
        return false;
    };

    // Opciones para horario (Día/Noche)        
    const horarioOptions = [
        { label: 'Día', value: 'D' },
        { label: 'Noche', value: 'N' }
    ];

    // useEffect principal:
    useEffect(() => {
        fetchViajes().then(setViajes);
        fetchClientes().then(setClientes2);
        fetchPreciosOrigenDestino().then(setPreciosOrigenDestino);
        fetchMateriales().then(setMateriales);
        fetchM3().then(setM3Options);
        fetchOperadores().then(setOperadores);
        fetchInvitados().then(setInvitados);
    }, []);

    const mostrarError = (mensaje: string) => { 
        toast.current?.show({ severity: 'error', summary: 'Error', detail: mensaje, life: 5000 }); 
    };

    useEffect(() => {
        const totalHoras = calcularTotalHorasViajes(viajes);
        const totalViajes = calcularTotalViajes(viajes);
        // Guardar los valores en el estado o mostrarlos directamente
    }, [viajes]);

      useEffect(() => { 
        const cargarDatosIniciales = async () => { 
        setLoading(prev => ({...prev, clientes: true, opciones: true})); 
        try { 
            const [clientesData, opcionesData] = await Promise.all([
            fetchClientesConViajes(),
            fetchOpcionesFiltros()
            ]);
            setClientes(clientesData); 
            setOpcionesFiltros(opcionesData);
        } catch (error) { 
            mostrarError('Error al cargar datos iniciales'); 
        } finally { 
            setLoading(prev => ({...prev, clientes: false, opciones: false})); 
        } 
        }; 
        cargarDatosIniciales(); 
    }, []); 

    const openNew = () => {
        setViaje({
            ...emptyViaje,
            id: undefined, // Asegúrate de que no tenga un ID
        });
        setSubmitted(false);
        setViajeDialog(true);
    };

    const hideDialog = () => {
        setSubmitted(false);
        setViajeDialog(false);
    };

    const hideDeleteViajeDialog = () => {
        setDeleteViajeDialog(false);
    };

    const hideDeleteViajesDialog = () => {
        setDeleteViajesDialog(false);
    };

    const saveViaje = async () => {
        setSubmitted(true);

        if (
            // viaje.folio_bco.trim() &&
            // viaje.folio.trim() &&
            // id_invitado es opcional, no debe bloquear el guardado
            viaje.id_cliente !== null &&
            viaje.id_material !== null &&
            viaje.id_m3 !== null &&
            viaje.id_precio_origen_destino !== null &&
            viaje.fecha
        ) {
            try {
                // Validar que si está en renta, tenga horas
                if (viaje.en_renta && (!viaje.horas_renta || viaje.horas_renta <= 0)) {
                    toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Las horas de renta son requeridas cuando el camión está en renta', life: 3000 });
                    return;
                }

                // Obtener el precio_unidad y metros_cubicos
                const precioOrigenDestino = preciosOrigenDestino.find(p => p.id === viaje.id_precio_origen_destino);
                const m3 = m3Options.find(m => m.id === viaje.id_m3);

                if (precioOrigenDestino && m3) {
                    const precio_unidad = precioOrigenDestino.precio_unidad;
                    const metros_cubicos = m3.metros_cubicos;

                    // Calcular caphrsviajes - MODIFICADO PARA RENTA
                    let caphrsviajes;
                    if (viaje.en_renta && viaje.horas_renta) {
                        // Si está en renta: precio_unidad * metros_cubicos * horas_renta
                        caphrsviajes = precio_unidad * metros_cubicos * viaje.horas_renta;
                    } else if (viaje.cantidad_viajes && viaje.cantidad_viajes > 0) {
                        // Si no está en renta pero si tiene cantidad de viaje es interno: precio_unidad * metros_cubicos * cantidad_viajes
                        caphrsviajes = precio_unidad * metros_cubicos * viaje.cantidad_viajes;
                    } else {
                        // Si no hay cantidad de viajes precio_unidad * metros_cubicos (comportamiento original)
                        caphrsviajes = precio_unidad * metros_cubicos;
                    }

                    console.log('precio_unidad:', precio_unidad);
                    console.log('metros_cubicos:', metros_cubicos);
                    console.log('en_renta:', viaje.en_renta);
                    console.log('horas_renta:', viaje.horas_renta);
                    console.log('caphrsviajes:', caphrsviajes);

                    // Crear un objeto limpio con los nuevos campos
                    const viajeLimpio = {
                        id_cliente: viaje.id_cliente,
                        fecha: viaje.fecha,
                        folio_bco: viaje.folio_bco,
                        folio: viaje.folio,
                        id_precio_origen_destino: viaje.id_precio_origen_destino,
                        id_material: viaje.id_material,
                        id_m3: viaje.id_m3,
                        caphrsviajes,
                        id_operador: viaje.id_operador,
                        id_invitado: viaje.id_invitado ?? null,
                        horario: viaje.horario || 'D',
                        en_renta: viaje.en_renta,
                        horas_renta: viaje.en_renta ? viaje.horas_renta : null,
                        numero_viaje: viaje.numero_viaje ?? null,
                        cantidad_viajes: viaje.cantidad_viajes ?? null,
                        observaciones: viaje.observaciones ?? null
                    };

                    console.log('Objeto enviado a Supabase:', { ...viajeLimpio, id: viaje.id });

                    if (viaje.id) {
                        const updatedViaje = await updateViaje({ ...viajeLimpio, id: viaje.id });
                        setViajes(viajes.map(v => v.id === updatedViaje.id ? updatedViaje : v));
                        toast.current?.show({ severity: 'success', summary: 'Successful', detail: 'Viaje Actualizado', life: 3000 });
                    } else {
                        const newViaje = await createViaje(viajeLimpio);
                        setViajes([...viajes, newViaje]);
                        toast.current?.show({ severity: 'success', summary: 'Successful', detail: 'Viaje Creado', life: 3000 });
                    }
                    fetchViajes().then(setViajes);
                    setViajeDialog(false);
                    setViaje(emptyViaje);
                } else {
                    toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Error fetching precio_unidad or metros_cubicos', life: 3000 });
                }
            } catch (error) {
                console.error('Error saving viaje:', error);
                toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Error saving viaje', life: 3000 });
            }
        }
    };
    

    const editViaje = async (viajeFila: Viaje) => {
        // La fila de la tabla viene de la vista `fetch_viajes`, que solo trae los nombres
        // ya resueltos (cliente_nombre, origen, material_nombre...) y no siempre los ids
        // crudos necesarios para preseleccionar los combos. Se piden los ids reales
        // directo de la tabla `viajes` antes de abrir el diálogo.
        setViaje(viajeFila);
        setViajeDialog(true);
        try {
            const viajeCompleto = await fetchViajeById(viajeFila.id!);
            setViaje({
                ...viajeFila,
                ...viajeCompleto,
                id_cliente: normalizeId(viajeCompleto.id_cliente) as number | null,
                id_operador: normalizeId(viajeCompleto.id_operador) as number | null,
                id_material: normalizeId(viajeCompleto.id_material) as number | null,
                id_m3: normalizeId(viajeCompleto.id_m3) as number | null,
                id_precio_origen_destino: normalizeId(viajeCompleto.id_precio_origen_destino) as number | null,
                id_invitado: normalizeId(viajeCompleto.id_invitado) as any
            });
        } catch (error) {
            console.error('Error cargando el viaje para editar:', error);
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el viaje para editar', life: 3000 });
            setViajeDialog(false);
        }
    };

    const confirmDeleteViaje = (viaje: Viaje) => {
        setViaje(viaje);
        setDeleteViajeDialog(true);
    };

    const deleteViajeConfirmado = async () => {
        try {
            await deleteViaje(viaje.id!);
            setViajes(viajes.filter(v => v.id !== viaje.id));
            setDeleteViajeDialog(false);
            setViaje(emptyViaje);
            toast.current?.show({ severity: 'success', summary: 'Successful', detail: 'Viaje Deleted', life: 3000 });
        } catch (error) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Error deleting viaje', life: 3000 });
        }
    };

    const exportCSV = () => {
        dt.current?.exportCSV();
    };

    const confirmDeleteSelected = () => {
        setDeleteViajesDialog(true);
    };

    const deleteSelectedViajes = async () => {
        try {
            await Promise.all(selectedViajes.map(v => deleteViaje(v.id!)));
            setViajes(viajes.filter(v => !selectedViajes.includes(v)));
            setDeleteViajesDialog(false);
            setSelectedViajes([]);
            toast.current?.show({ severity: 'success', summary: 'Successful', detail: 'Viajes Deleted', life: 3000 });
        } catch (error) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Error deleting viajes', life: 3000 });
        }
    };

    const abrirCargaMasiva = () => {
        setFilasCarga([]);
        setNombreArchivoCarga('');
        setCargaMasivaDialog(true);
    };

    const cerrarCargaMasiva = () => {
        if (guardandoCarga) return;
        setCargaMasivaDialog(false);
        setFilasCarga([]);
        setNombreArchivoCarga('');
    };

    const descargarPlantillaCarga = () => {
        const ws = XLSX.utils.json_to_sheet([FILA_EJEMPLO_PLANTILLA_CARGA], { header: COLUMNAS_PLANTILLA_CARGA });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Viajes');
        XLSX.writeFile(wb, 'Plantilla_Carga_Masiva_Viajes.xlsx');
    };

    // Lee el Excel, resuelve los nombres (Cliente, Origen, Destino, Material, M3, Operador,
    // Invitado) contra los catálogos ya cargados, calcula el Total Flete igual que el alta
    // manual y marca en `errores` cualquier fila que no se pueda guardar tal cual.
    const procesarArchivoCarga = async (file: File) => {
        setProcesandoArchivo(true);
        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
            const hoja = wb.Sheets[wb.SheetNames[0]];
            const filasExcel = XLSX.utils.sheet_to_json<any>(hoja, { defval: '' });

            if (filasExcel.length === 0) {
                toast.current?.show({ severity: 'warn', summary: 'Archivo vacío', detail: 'El Excel no tiene filas de datos', life: 4000 });
                setFilasCarga([]);
                return;
            }

            const foliosVistos = new Set<string>();
            const procesadas: FilaCargaMasiva[] = filasExcel.map((fila, indice) => {
                const errores: string[] = [];

                const fecha = parseFechaExcel(fila['Fecha']);
                if (!fecha) errores.push('Fecha vacía o con formato inválido (usa AAAA-MM-DD o DD/MM/AAAA)');

                const clienteTexto = normalizarTexto(fila['Cliente']);
                const cliente = buscarPorNombre(clientes2, 'empresa', clienteTexto);
                if (!clienteTexto) errores.push('Cliente vacío');
                else if (!cliente) errores.push(`Cliente "${clienteTexto}" no encontrado`);

                const origenTexto = normalizarTexto(fila['Origen']);
                const destinoTexto = normalizarTexto(fila['Destino']);
                const ruta = preciosOrigenDestino.find(
                    p => normalizarTextoComparacion(p.origen) === normalizarTextoComparacion(origenTexto) &&
                         normalizarTextoComparacion(p.destino) === normalizarTextoComparacion(destinoTexto)
                );
                if (!origenTexto || !destinoTexto) errores.push('Origen y/o Destino vacío');
                else if (!ruta) errores.push(`Ruta "${origenTexto} - ${destinoTexto}" no encontrada`);

                const materialTexto = normalizarTexto(fila['Material']);
                const material = buscarPorNombre(materiales, 'nombre', materialTexto);
                if (!materialTexto) errores.push('Material vacío');
                else if (!material) errores.push(`Material "${materialTexto}" no encontrado`);

                // M3 admite dos formas: el nombre de un M3 del catálogo, o un valor manual en
                // metros cúbicos para camiones externos que no están dados de alta en el
                // catálogo (en ese caso id_m3 se guarda como null; no se crea nada en el catálogo).
                const m3Texto = normalizarTexto(fila['M3']);
                const m3 = m3Texto ? buscarPorNombre(m3Options, 'nombre', m3Texto) : undefined;
                const m3ManualTexto = normalizarTexto(fila['M3 (manual)']);
                const m3Manual = parseNumeroOpcional(fila['M3 (manual)']);

                if (m3Texto && m3ManualTexto) {
                    errores.push('Especifica solo M3 o M3 (manual), no ambos');
                } else if (m3Texto && !m3) {
                    errores.push(`M3 "${m3Texto}" no encontrado`);
                } else if (m3ManualTexto && (m3Manual === null || m3Manual <= 0)) {
                    errores.push(`M3 (manual) "${m3ManualTexto}" no es un número válido`);
                } else if (!m3Texto && !m3ManualTexto) {
                    errores.push('M3 vacío (usa la columna "M3" o "M3 (manual)")');
                }

                const metrosCubicosEfectivos = m3 ? m3.metros_cubicos : (m3Manual && m3Manual > 0 ? m3Manual : null);

                const operadorTexto = normalizarTexto(fila['Operador']);
                const operador = operadorTexto ? buscarPorNombre(operadores, 'nombre', operadorTexto) : undefined;
                if (operadorTexto && !operador) errores.push(`Operador "${operadorTexto}" no encontrado`);

                const invitadoTexto = normalizarTexto(fila['Invitado']);
                const invitado = invitadoTexto ? buscarPorNombre(invitados, 'empresa', invitadoTexto) : undefined;
                if (invitadoTexto && !invitado) errores.push(`Invitado "${invitadoTexto}" no encontrado`);

                const enRenta = parseSiNo(fila['En Renta']);
                const horasRenta = parseNumeroOpcional(fila['Horas de Renta']);
                if (enRenta && (!horasRenta || horasRenta <= 0)) errores.push('Horas de Renta es requerido cuando En Renta = Sí');

                const folio = normalizarTexto(fila['Folio']) || null;
                if (folio) {
                    const folioNormalizado = normalizarTextoComparacion(folio);
                    if (foliosVistos.has(folioNormalizado)) errores.push(`Folio "${folio}" duplicado dentro del archivo`);
                    foliosVistos.add(folioNormalizado);
                }

                const cantidadViajes = parseNumeroOpcional(fila['Cantidad de Viajes']);

                let caphrsviajes: number | null = null;
                if (ruta && metrosCubicosEfectivos) {
                    if (enRenta && horasRenta) {
                        caphrsviajes = ruta.precio_unidad * metrosCubicosEfectivos * horasRenta;
                    } else if (cantidadViajes && cantidadViajes > 0) {
                        caphrsviajes = ruta.precio_unidad * metrosCubicosEfectivos * cantidadViajes;
                    } else {
                        caphrsviajes = ruta.precio_unidad * metrosCubicosEfectivos;
                    }
                }

                // El M3 manual no queda en ningún catálogo, así que se anota en Observaciones
                // para no perder el dato (la columna "M3" de la tabla de viajes se muestra a
                // partir del catálogo, y para estas filas no habrá ese vínculo).
                const observacionesTexto = normalizarTexto(fila['Observaciones']);
                const observacionesFinal = m3Manual
                    ? `M3 externo: ${m3Manual} m³.${observacionesTexto ? ' ' + observacionesTexto : ''}`
                    : (observacionesTexto || null);

                return {
                    fila: indice + 2, // +2: la fila 1 es el encabezado y Excel es 1-indexado
                    textoOriginal: {
                        cliente: clienteTexto,
                        origen: origenTexto,
                        destino: destinoTexto,
                        material: materialTexto,
                        m3: m3 ? m3Texto : (m3Manual ? `Manual: ${m3Manual} m³` : ''),
                        operador: operadorTexto,
                        invitado: invitadoTexto
                    },
                    datos: {
                        id_cliente: cliente ? cliente.id : null,
                        fecha: fecha || '',
                        folio_bco: normalizarTexto(fila['Folio Banco']),
                        folio: folio || '',
                        id_precio_origen_destino: ruta ? ruta.id : null,
                        id_material: material ? material.id : null,
                        id_m3: m3 ? m3.id : null,
                        caphrsviajes,
                        id_operador: operador ? operador.id : null,
                        id_invitado: invitado ? (invitado.id as any) : null,
                        en_renta: enRenta,
                        horas_renta: enRenta ? horasRenta : null,
                        horario: parseHorario(fila['Horario']),
                        numero_viaje: parseNumeroOpcional(fila['Numero de Viaje']),
                        cantidad_viajes: cantidadViajes,
                        observaciones: observacionesFinal
                    },
                    errores
                };
            });

            // Revisar folios duplicados contra los que ya existen en la base de datos
            const foliosParaChecar = procesadas.filter(p => p.datos.folio).map(p => p.datos.folio);
            if (foliosParaChecar.length > 0) {
                const existentes = await checkFoliosExisten(foliosParaChecar);
                procesadas.forEach(p => {
                    if (p.datos.folio && existentes.has(p.datos.folio)) {
                        p.errores.push(`Folio "${p.datos.folio}" ya existe en la base de datos`);
                    }
                });
            }

            setFilasCarga(procesadas);
        } catch (error) {
            console.error('Error leyendo el archivo de carga masiva:', error);
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo leer el archivo. Verifica que sea un Excel válido y use la plantilla.', life: 5000 });
            setFilasCarga([]);
        } finally {
            setProcesandoArchivo(false);
        }
    };

    const manejarSeleccionArchivo = async (e: FileUploadHandlerEvent) => {
        const file = e.files?.[0];
        if (!file) return;
        setNombreArchivoCarga(file.name);
        await procesarArchivoCarga(file);
    };

    const filasValidasCarga = filasCarga.filter(f => f.errores.length === 0);
    const filasConErrorCarga = filasCarga.filter(f => f.errores.length > 0);

    const guardarCargaMasiva = async () => {
        if (filasValidasCarga.length === 0) return;
        setGuardandoCarga(true);
        try {
            const insertados = await createViajesBulk(filasValidasCarga.map(f => f.datos));
            toast.current?.show({
                severity: 'success',
                summary: 'Carga masiva completada',
                detail: `${insertados.length} viaje(s) cargado(s) correctamente${filasConErrorCarga.length > 0 ? `. ${filasConErrorCarga.length} fila(s) se omitieron por errores.` : ''}`,
                life: 5000
            });
            fetchViajes().then(setViajes);
            cerrarCargaMasiva();
        } catch (error) {
            console.error('Error guardando la carga masiva:', error);
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo completar la carga masiva', life: 5000 });
        } finally {
            setGuardandoCarga(false);
        }
    };

    const leftToolbarTemplate = () => {
        return (
            <React.Fragment>
                <div className="my-2">
                    {/* <Button label="Nuevo" icon="pi pi-plus" severity="info" className="mr-2" onClick={openNew} /> */}
                    <Button label="Eliminar" icon="pi pi-trash" severity="danger" className="mr-2" onClick={confirmDeleteSelected} disabled={!selectedViajes || !selectedViajes.length} />
                    <Button label="Filtros" icon="pi pi-filter" className="p-button-outlined mr-2" onClick={() => setShowFiltros(true)} />
                    <Button label="Carga Masiva" icon="pi pi-file-excel" severity="success" className="p-button-outlined" onClick={abrirCargaMasiva} />
                </div>
            </React.Fragment>
        );
    };

    const rightToolbarTemplate = () => {
        return (
            <React.Fragment>
                <Button label="Export" icon="pi pi-upload" severity="help" onClick={exportCSV} />
            </React.Fragment>
        );
    };

    const IdBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Id</span>
                {rowData.id}
            </>
        );
    };

    const fechaBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Fecha</span>
                {rowData.fecha}
            </>
        );
    };

    const folioBcoBodyTemplate = (rowData: Viaje) => {
        const valor = rowData.folio_bco?.toString().trim();
        return (
            <>
                <span className="p-column-title">Folio Banco</span>
                {valor ? valor : '-'}
            </>
        );
    };

    const folioBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Folio</span>
                {rowData.folio ?? '-'}
            </>
        );
    };

    const folioNo_ViajeBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">No. Viaje</span>
                {rowData.numero_viaje ?? '-'}
            </>
        );
    };

    const clienteBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Cliente</span>
                {rowData.cliente_nombre}
            </>
        );
    };

    const operadorBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Operador</span>
                {rowData.operador_nombre ?? '-'}
            </>
        );
    };

    const origenBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Origen</span>
                {rowData.origen}
            </>
        );
    };

    const destinoBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Destino</span>
                {rowData.destino}
            </>
        );
    };

    const materialBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Material</span>
                {rowData.material_nombre}
            </>
        );
    };

    const m3BodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">M3</span>
                {rowData.m3_nombre}
            </>
        );
    };

    const caphrsviajesBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Cap. Hrs Viajes</span>
                ${' '}
                {rowData.caphrsviajes?.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }) || '0.00'}
            </>
        );
    };

    const totalMaterialBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Total Material</span>
                ${' '}
                {rowData.total_materia?.toLocaleString('es-MX', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }) || '0.00'}
            </>
        );
    }

    const rentaBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Renta</span>
                {rowData.en_renta ? (
                    <div className="flex align-items-center">
                        <i className="pi pi-check-circle text-green-500 mr-2" />
                        <span>{rowData.horas_renta?.toFixed(2)} hrs</span>
                    </div>
                ) : (
                    <div className="flex align-items-center">
                        <i className="pi pi-times-circle text-red-500 mr-2" />
                        <span>No</span>
                    </div>
                )}
            </>
        );
    };

    const invitadoBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Invitado</span>
                {rowData.invitado_nombre ?? '-'}
            </>
        );
    };

    const horarioBodyTemplate = (rowData: Viaje) => {
        const horarioMap = {
            'D': 'Día',
            'N': 'Noche'
        };
        return (
            <>
                <span className="p-column-title">Horario</span>
                <span>{horarioMap[rowData.horario as keyof typeof horarioMap] || rowData.horario || '-'}</span>
            </>
        );
    };

    const observacionesBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Observaciones</span>
                {rowData.observaciones ?? '-'}
            </>
        );
    }

    const ESTATUS_SEVERIDAD: Record<string, 'info' | 'warning' | 'success' | 'danger'> = {
        estimado: 'info',
        aprobado: 'warning',
        facturado: 'success',
        pagado: 'success'
    };

    const estatusBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Estatus</span>
                {rowData.estatus ? <Tag severity={ESTATUS_SEVERIDAD[rowData.estatus] ?? 'info'} value={rowData.estatus} /> : '-'}
            </>
        );
    }

    const cantidadViajesBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <span className="p-column-title">Cantidad de Viajes</span>
                {rowData.cantidad_viajes ?? '-'}
            </>
        );
    }

    const actionBodyTemplate = (rowData: Viaje) => {
        return (
            <>
                <Button icon="pi pi-pencil" rounded severity="info" className="mr-2" onClick={() => editViaje(rowData)} />
                <Button
                    icon="pi pi-image"
                    rounded
                    severity="secondary"
                    className="mr-2"
                    tooltip="Ticket de carga"
                    tooltipOptions={{ position: 'top' }}
                    aria-label="Ver ticket de carga"
                    onClick={() => setTicketDe(rowData)}
                />
                <Button icon="pi pi-trash" rounded severity="danger" onClick={() => confirmDeleteViaje(rowData)} />
            </>
        );
    };

    const header = (
        <div className="flex flex-column md:flex-row md:justify-content-between md:align-items-center">
            <h5 className="m-0">Gestión de Viajes</h5>
            <span className="block mt-2 md:mt-0 p-input-icon-left">
                <i className="pi pi-search" />
                <InputText
                    type="search"
                    onInput={(e) =>
                        setFilters({
                            ...filters,
                            global: { value: e.currentTarget.value, matchMode: 'contains' }
                        })
                    }
                    placeholder="Buscar..."
                />
            </span>
        </div>
    );

    const viajeDialogFooter = (
        <>
            <Button label="Cancel" icon="pi pi-times" text onClick={hideDialog} />
            <Button label="Save" icon="pi pi-check" text onClick={saveViaje} />
        </>
    );
    const deleteViajeDialogFooter = (
        <>
            <Button label="No" icon="pi pi-times" text onClick={hideDeleteViajeDialog} />
            <Button label="Yes" icon="pi pi-check" text onClick={deleteViajeConfirmado} />
        </>
    );
    const deleteViajesDialogFooter = (
        <>
            <Button label="No" icon="pi pi-times" text onClick={hideDeleteViajesDialog} />
            <Button label="Yes" icon="pi pi-check" text onClick={deleteSelectedViajes} />
        </>
    );

    return (
        <div className="grid crud-demo">
            {/* Mostrar el total de horas de viaje */}
            <div className="col-12 lg:col-6 xl:col-3">
                <div className="card mb-0">
                    <div className="flex justify-content-between mb-3">
                    <div>
                        <span className="block text-500 font-medium mb-3">Sub Total</span>
                        <div className="text-900 font-medium text-xl">
                            $ {calcularTotalHorasViajes(viajes).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Pesos
                        </div>
                    </div>
                        <div className="flex align-items-center justify-content-center bg-green-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                            <i className="pi pi-clock text-black-500 text-xl" />
                        </div>
                    </div>Gestión de Notas de Viajes
                    <span className="text-500">Total sin IVA</span>
                </div>
            </div>

            {/* Mostrar el total de viajes */}
            <div className="col-12 lg:col-6 xl:col-3">
                <div className="card mb-0">
                    <div className="flex justify-content-between mb-3">
                        <div>
                            <span className="block text-500 font-medium mb-3">Total de Viajes</span>
                            <div className="text-900 font-medium text-xl">{calcularTotalViajes(viajes)}</div>
                        </div>
                        <div className="flex align-items-center justify-content-center bg-green-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                            <i className="pi pi-car text-black-500 text-xl" />
                        </div>
                    </div>
                    <span className="text-500">Total de viajes realizados</span>
                </div>
            </div>
            <div className="col-12">
                <div className="card">
                    <Toast ref={toast} />
                    <TicketViajeDialog
                        origen={ticketDe?.id ? { tipo: 'viaje', id: ticketDe.id } : null}
                        folio={ticketDe?.folio}
                        onHide={() => setTicketDe(null)}
                    />
                    <Toolbar className="mb-4" left={leftToolbarTemplate} right={rightToolbarTemplate}></Toolbar>

                    <DataTable
                        ref={dt}
                        value={filteredViajes.length ? filteredViajes : viajes}
                        selection={selectedViajes}
                        onSelectionChange={(e) => setSelectedViajes(e.value)}
                        dataKey="id"
                        paginator
                        rows={10}
                        rowsPerPageOptions={[5, 10, 25]}
                        className="datatable-responsive"
                        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
                        currentPageReportTemplate="Showing {first} to {last} of {totalRecords} viajes"
                        filters={filters} // PARA EL DE BUSQUEDA
                        filterDisplay="menu"
                        emptyMessage="No viajes found."
                        header={header}
                        responsiveLayout="scroll"
                    >
                        <Column selectionMode="multiple" headerStyle={{ width: '4rem' }}></Column>
                        <Column field="id" header="Id" sortable body={IdBodyTemplate} exportable={true}></Column>
                        <Column field="fecha" header="Fecha" sortable body={fechaBodyTemplate}></Column>
                        <Column field="folio_bco" header="Folio Banco" sortable body={folioBcoBodyTemplate}></Column>
                        <Column field="folio" header="Folio" sortable body={folioBodyTemplate}></Column>
                        <Column field="numero_viaje" header="No. Viaje" sortable body={folioNo_ViajeBodyTemplate}></Column>
                        <Column field="cantidad_viajes" header="Cantidad de Viajes" sortable body={cantidadViajesBodyTemplate}></Column>
                        <Column field="cliente_nombre" header="Cliente" sortable body={clienteBodyTemplate}></Column>
                        <Column field="operador_nombre" header="Operador" sortable body={operadorBodyTemplate}></Column>
                        <Column field="origen" header="Origen" sortable body={origenBodyTemplate}></Column>
                        <Column field="destino" header="Destino" sortable body={destinoBodyTemplate}></Column>
                        <Column field="material_nombre" header="Material" sortable body={materialBodyTemplate}></Column>
                        <Column field="m3_nombre" header="M3" sortable body={m3BodyTemplate}></Column>
                        <Column field="en_renta" header="Renta" sortable body={rentaBodyTemplate}></Column>
                        <Column field="invitado_nombre" header="Invitado" sortable body={invitadoBodyTemplate}></Column>
                        <Column field="horario" header="Horario" sortable body={horarioBodyTemplate}></Column>
                        <Column field="observaciones" header="Observaciones" sortable body={observacionesBodyTemplate}></Column>
                        <Column field="estatus" header="Estatus" sortable body={estatusBodyTemplate}></Column>
                        <Column field="caphrsviajes" header="Total Flete" sortable body={caphrsviajesBodyTemplate} style={{ width: '150px', minWidth: '120px' }}></Column>
                        <Column field="total_material" header="Total Material" sortable body={totalMaterialBodyTemplate} style={{ width: '150px', minWidth: '120px' }}></Column>
                        <Column header="Acción" body={actionBodyTemplate} headerStyle={{ minWidth: '10rem' }}></Column>
                    </DataTable>

                    <Dialog visible={viajeDialog} style={{ width: '550px' }} header="Viaje" modal className="p-fluid" footer={viajeDialogFooter} onHide={hideDialog}>
                        <div className="field">
                            <label htmlFor="fecha">Fecha</label>
                            <Calendar
                                id="fecha"
                                value={
                                    viaje.fecha
                                        ? (() => {
                                            const [year, month, day] = viaje.fecha.split('-').map(Number);
                                            return new Date(year, month - 1, day);
                                        })()
                                        : null
                                }
                                onChange={(e) =>
                                    setViaje({
                                        ...viaje,
                                        fecha: e.value
                                            ? `${e.value.getFullYear()}-${String(e.value.getMonth() + 1).padStart(2, '0')}-${String(e.value.getDate()).padStart(2, '0')}`
                                            : ''
                                    })
                                }
                                dateFormat="yy-mm-dd"
                                showIcon
                                required
                                className={submitted && !viaje.fecha ? 'p-invalid' : ''}
                            />
                            {submitted && !viaje.fecha && <small className="p-invalid">Fecha es requerido.</small>}
                        </div>
                        <div className="field">
                            <label htmlFor="folio_bco">Folio Banco</label>
                            <InputText
                                id="folio_bco"
                                value={viaje.folio_bco}
                                onChange={(e) => setViaje({ ...viaje, folio_bco: e.target.value })}
                                // required
                                autoFocus
                                // className={submitted && !viaje.folio_bco ? 'p-invalid' : ''}
                            />
                            {/* {submitted && !viaje.folio_bco && <small className="p-invalid">Folio Banco es requerido.</small>} */}
                        </div>
                        <div className="field">
                            <label htmlFor="folio">Folio</label>
                           <InputText
                                id="folio"
                                value={viaje.folio}
                                onChange={(e) => {
                                    setViaje({ ...viaje, folio: e.target.value });
                                    // Limpiar el estado de error si el usuario modifica el folio
                                    if (folioError) {
                                    setFolioError(false);
                                    }
                                }}
                                onBlur={async () => {
                                    if (viaje.folio && !viaje.id) { // Solo validar si hay folio
                                    const folioExists = await checkFolioExists(viaje.folio);
                                    if (folioExists) {
                                        setFolioError(true); // Activar estado de error
                                        toast.current?.show({ 
                                        severity: 'error', // Cambiado a 'error' en lugar de 'warn'
                                        summary: 'Error: Folio duplicado', 
                                        detail: `El folio "${viaje.folio}" ya existe. Por favor ingresa un folio diferente.`, 
                                        life: 5000 
                                        });
                                    } else {
                                        setFolioError(false); // Limpiar error si el folio es válido
                                    }
                                    }
                                }}
                                // required
                                // className={submitted && !viaje.folio ? 'p-invalid' : (folioError ? 'p-invalid' : '')}
                            />
                            {/* {submitted && !viaje.folio && <small className="p-invalid">Folio es requerido.</small>} */}
                        </div>

                        <div className="field">
                            <label htmlFor="numero_viaje">No. Viaje</label>
                            <InputNumber
                                id="numero_viaje"
                                value={viaje.numero_viaje}
                                onValueChange={(e) => setViaje({ ...viaje, numero_viaje: e.value })}
                                useGrouping={false}
                                // required
                                autoFocus
                                // className={submitted && !viaje.numero_viaje ? 'p-invalid' : ''}
                            />
                            {/* {submitted && !viaje.numero_viaje && <small className="p-invalid">No. Viaje es requerido.</small>} */}
                        </div>

                        <div className="field">
                            <label htmlFor="cantidad_viajes">Cantidad de Viajes</label>
                            <InputNumber
                                id="cantidad_viajes"
                                value={viaje.cantidad_viajes ?? null}
                                onValueChange={(e) => setViaje({ ...viaje, cantidad_viajes: e.value ?? null })}
                                useGrouping={false}
                                //required
                                //className={submitted && !viaje.cantidad_viajes ? 'p-invalid' : ''}
                            />
                            {/* {submitted && !viaje.cantidad_viajes && <small className="p-invalid">Cantidad de Viajes es requerido.</small>} */}
                        </div>

                        <div className="field">
                            <label htmlFor="id_cliente">Cliente</label>
                            <Dropdown
                                id="id_cliente"
                                value={viaje.id_cliente}
                                options={clientes2.map(c => ({ label: c.empresa, value: normalizeId(c.id) }))}
                                onChange={(e) => setViaje({ ...viaje, id_cliente: e.value })}
                                placeholder="Selecciona un cliente"
                                required
                                className={submitted && !viaje.id_cliente ? 'p-invalid' : ''}
                            />
                            {submitted && !viaje.id_cliente && <small className="p-invalid">Cliente es requerido.</small>}
                        </div>

                        <div className="field">
                            <label htmlFor="id_precio_origen_destino">Origen - Destino</label>
                            <Dropdown
                                id="id_precio_origen_destino"
                                value={viaje.id_precio_origen_destino}
                                options={preciosOrigenDestino.map(p => ({
                                    label: `${p.label} - ($${p.precio_unidad?.toLocaleString('es-MX', { minimumFractionDigits: 2 }) ?? '0.00'})`,
                                    value: normalizeId(p.id),
                                    precio_unidad: p.precio_unidad
                                }))}
                                onChange={(e) => setViaje({ ...viaje, id_precio_origen_destino: e.value })}
                                placeholder="Selecciona un origen-destino"
                                required
                                className={submitted && !viaje.id_precio_origen_destino ? 'p-invalid' : ''}
                                itemTemplate={(option) => (
                                    <div>
                                        <span>{option.label}</span>
                                    </div>
                                )}
                            />
                            {submitted && !viaje.id_precio_origen_destino && <small className="p-invalid">Origen-Destino es requerido.</small>}
                        </div>

                        <div className="field">
                            <label htmlFor="id_material">Material</label>
                            <Dropdown
                                id="id_material"
                                value={viaje.id_material}
                                options={materiales.map(m => ({ label: m.nombre, value: normalizeId(m.id) }))}
                                onChange={(e) => setViaje({ ...viaje, id_material: e.value })}
                                placeholder="Selecciona un material"
                                required
                                className={submitted && !viaje.id_material ? 'p-invalid' : ''}
                            />
                            {submitted && !viaje.id_material && <small className="p-invalid">Material es requerido.</small>}
                        </div>

                        <div className="field">
                            <label htmlFor="id_m3">M3</label>
                            <Dropdown
                                id="id_m3"
                                value={viaje.id_m3}
                                options={m3Options.map(m => ({ label: m.nombre, value: normalizeId(m.id) }))}
                                onChange={(e) => setViaje({ ...viaje, id_m3: e.value })}
                                placeholder="Selecciona un M3"
                                required
                                className={submitted && !viaje.id_m3 ? 'p-invalid' : ''}
                            />
                            {submitted && !viaje.id_m3 && <small className="p-invalid">M3 es requerido.</small>}
                        </div>

                        <div className="operador">
                            <label htmlFor="id_operador">Operador</label>
                            <Dropdown
                                id="id_operador"
                                value={viaje.id_operador}
                                options={operadores.map(op => ({ label: op.nombre, value: normalizeId(op.id) }))}
                                onChange={(e) => setViaje({ ...viaje, id_operador: e.value })}
                                placeholder="Selecciona un operador"
                                className={submitted && !viaje.id_operador ? 'p-invalid' : ''}
                            />
                            {submitted && !viaje.id_operador && <small className="p-invalid">Operador es requerido.</small>}
                        </div>

                        <br />

                        <div className="field">
                            <label htmlFor="id_invitado">Invitado</label>
                            <Dropdown
                                id="id_invitado"
                                value={viaje.id_invitado}
                                options={invitados.map(i => ({ label: i.empresa, value: normalizeId(i.id) }))}
                                onChange={(e) => setViaje({ ...viaje, id_invitado: e.value })}
                                placeholder="Selecciona un invitado (opcional)"
                            />
                        </div>

                        <div className="field">
                            <label htmlFor="horario">Horario</label>
                            <Dropdown
                                id="horario"
                                value={viaje.horario || 'D'}
                                options={horarioOptions}
                                onChange={(e) => setViaje({ ...viaje, horario: e.value })}
                                placeholder="Selecciona horario"
                            />
                        </div>
                        
                        <div className="field">
                            <label htmlFor="observaciones">Observaciones</label>
                            <InputText
                                id="observaciones"
                                value={viaje.observaciones || ''}
                                onChange={(e) => setViaje({ ...viaje, observaciones: e.target.value })}
                                placeholder="Escriba alguna observación"
                            />
                        </div>

                        <br />
                        {/* Campo para renta */}
                        <div className="field">
                            <label htmlFor="en_renta" className="block mb-2">
                                <Checkbox
                                    id="en_renta"
                                    checked={viaje.en_renta}
                                    onChange={(e) => setViaje({ 
                                        ...viaje, 
                                        en_renta: e.checked ?? false,
                                        horas_renta: e.checked ? (viaje.horas_renta || 0) : null
                                    })}
                                />
                                <span className="ml-2">¿El camión está en renta?</span>
                            </label>
                        </div>

                        {/* Campo para horas de renta - solo visible si está en renta */}
                        {viaje.en_renta && (
                            <div className="field">
                                <label htmlFor="horas_renta">Horas de Renta</label>
                                <InputNumber
                                    id="horas_renta"
                                    value={viaje.horas_renta ?? 0}
                                    onValueChange={(e) => setViaje({ ...viaje, horas_renta: e.value ?? 0 })}
                                    mode="decimal"
                                    min={0}
                                    minFractionDigits={2}
                                    maxFractionDigits={2}
                                    placeholder="0.00"
                                    required={viaje.en_renta}
                                    className={submitted && viaje.en_renta && !viaje.horas_renta ? 'p-invalid' : ''}
                                />
                                {submitted && viaje.en_renta && !viaje.horas_renta && (
                                    <small className="p-invalid">Las horas de renta son requeridas cuando el camión está en renta.</small>
                                )}
                            </div>
                        )}
                        <div className="field">
                            {viaje.id && ( // Solo muestra el campo si viaje.id existe (modo update)
                                <>
                                    <label htmlFor="caphrsviajes">Cap. Hrs Viajes</label>
                                    <InputNumber
                                        id="caphrsviajes"
                                        value={viaje.caphrsviajes ?? null}
                                        onValueChange={(e) => setViaje({ ...viaje, caphrsviajes: e.value ?? null })}
                                        mode="decimal"
                                        minFractionDigits={0}   // mínimo de decimales
                                        maxFractionDigits={2}   // máximo de decimales permitidos
                                        required
                                        className={submitted && !viaje.caphrsviajes ? 'p-invalid' : ''}
                                    />
                                    {submitted && !viaje.caphrsviajes && <small className="p-invalid">Cap. Hrs Viajes es requerido.</small>}
                                </>
                            )}
                        </div>
                    </Dialog>

                {/* Diálogo de Carga Masiva de Viajes */}
                <Dialog
                    visible={cargaMasivaDialog}
                    onHide={cerrarCargaMasiva}
                    header="Carga Masiva de Viajes"
                    style={{ width: '95vw', maxWidth: '1100px' }}
                    modal
                    footer={
                        <>
                            <Button label="Cancelar" icon="pi pi-times" text onClick={cerrarCargaMasiva} disabled={guardandoCarga} />
                            {filasCarga.length > 0 && (
                                <Button
                                    label={`Guardar ${filasValidasCarga.length} viaje(s)`}
                                    icon="pi pi-check"
                                    onClick={guardarCargaMasiva}
                                    loading={guardandoCarga}
                                    disabled={filasValidasCarga.length === 0}
                                />
                            )}
                        </>
                    }
                >
                    <div className="mb-4 p-3 border-round surface-100">
                        <p className="mt-0 mb-2"><b>Campos obligatorios:</b> Fecha, Cliente, Origen, Destino, Material, y el M3 (usando la columna &quot;M3&quot; o la columna &quot;M3 (manual)&quot;, ver abajo).</p>
                        <p className="mt-0 mb-2"><b>Campos opcionales:</b> Operador, Invitado, Folio, Folio Banco, Horario (D/N, por defecto Día), Numero de Viaje, Cantidad de Viajes, En Renta (Sí/No), Horas de Renta (obligatorio solo si En Renta = Sí), Observaciones.</p>
                        <p className="mt-0 mb-2">Cliente, Origen, Destino, Material, M3, Operador e Invitado deben escribirse <b>exactamente igual</b> a como están dados de alta en el sistema.</p>
                        <p className="mt-0 mb-2"><b>M3 (manual):</b> para camiones externos que no están en el catálogo M3, deja la columna &quot;M3&quot; vacía y escribe el número de metros cúbicos en &quot;M3 (manual)&quot;. No se crea nada nuevo en el catálogo; ese valor solo se usa para calcular el Total Flete de esa fila y queda anotado en Observaciones. Usa solo una de las dos columnas por fila, nunca ambas.</p>
                        <p className="mt-0 mb-0">El Total Flete se calcula automáticamente (precio de la ruta × M3 × horas de renta o cantidad de viajes), no hace falta incluirlo en el Excel.</p>
                    </div>

                    <div className="flex flex-wrap align-items-center gap-2 mb-4">
                        <Button label="Descargar plantilla" icon="pi pi-download" className="p-button-outlined" onClick={descargarPlantillaCarga} />
                        <FileUpload
                            mode="basic"
                            name="cargaMasivaExcel"
                            accept=".xlsx,.xls"
                            maxFileSize={10000000}
                            customUpload
                            uploadHandler={manejarSeleccionArchivo}
                            chooseLabel={nombreArchivoCarga || 'Seleccionar Excel'}
                            auto
                        />
                        {procesandoArchivo && <span className="text-500"><i className="pi pi-spin pi-spinner mr-2" />Procesando archivo...</span>}
                    </div>

                    {filasCarga.length > 0 && (
                        <>
                            <div className="flex gap-3 mb-3">
                                <Tag severity="success" value={`${filasValidasCarga.length} válida(s)`} />
                                {filasConErrorCarga.length > 0 && <Tag severity="danger" value={`${filasConErrorCarga.length} con error`} />}
                            </div>
                            <DataTable value={filasCarga} paginator rows={10} className="datatable-responsive" size="small" scrollable>
                                <Column field="fila" header="Fila" style={{ width: '4rem' }} />
                                <Column header="Fecha" body={(f: FilaCargaMasiva) => f.datos.fecha || '-'} />
                                <Column header="Cliente" body={(f: FilaCargaMasiva) => f.textoOriginal.cliente || '-'} />
                                <Column header="Origen" body={(f: FilaCargaMasiva) => f.textoOriginal.origen || '-'} />
                                <Column header="Destino" body={(f: FilaCargaMasiva) => f.textoOriginal.destino || '-'} />
                                <Column header="Material" body={(f: FilaCargaMasiva) => f.textoOriginal.material || '-'} />
                                <Column header="M3" body={(f: FilaCargaMasiva) => f.textoOriginal.m3 || '-'} />
                                <Column header="Folio" body={(f: FilaCargaMasiva) => f.datos.folio || '-'} />
                                <Column
                                    header="Estado"
                                    body={(f: FilaCargaMasiva) =>
                                        f.errores.length === 0 ? (
                                            <Tag severity="success" value="OK" />
                                        ) : (
                                            <Tag severity="danger" value="Error" className="cursor-pointer" title={f.errores.join(' | ')} />
                                        )
                                    }
                                />
                                <Column
                                    header="Detalle de errores"
                                    body={(f: FilaCargaMasiva) =>
                                        f.errores.length === 0 ? '-' : (
                                            <span className="text-red-600 text-sm">{f.errores.join(' | ')}</span>
                                        )
                                    }
                                />
                            </DataTable>
                        </>
                    )}
                </Dialog>

                {/* Diálogo de Filtros */}
                <Dialog 
                    visible={showFiltros} 
                    onHide={() => setShowFiltros(false)} 
                    header="Filtrar Viajes" 
                    style={{ width: '500px' }}
                    >
                    <div className="p-fluid">
                        <div className="field">
                        <label>Rango de Fechas</label>
                        <div className="flex gap-2">
                            <Calendar 
                            value={filtros.fechaInicio} 
                            onChange={(e) => setFiltros({...filtros, fechaInicio: e.value ?? null})}
                            dateFormat="yy-mm-dd"
                            placeholder="Fecha inicio"
                            showIcon
                            readOnlyInput
                            />
                            <Calendar 
                            value={filtros.fechaFin} 
                            onChange={(e) => setFiltros({...filtros, fechaFin: e.value ?? null})}
                            dateFormat="yy-mm-dd"
                            placeholder="Fecha fin"
                            showIcon
                            readOnlyInput
                            />
                        </div>
                        </div>
                        
                        <div className="field">
                        <label>Cliente</label>
                        <Dropdown
                            value={filtros.clienteId}
                            onChange={(e) => setFiltros({...filtros, clienteId: e.value})}
                            options={clientes2.map(c => ({ label: c.empresa, value: c.id }))}
                            placeholder="Seleccionar cliente"
                            showClear
                            filter
                        />
                        </div>
                        <div className="field">
                        <label>Operador</label>
                        <Dropdown 
                            value={filtros.operador} 
                            onChange={(e) => setFiltros({...filtros, operador: e.value})}
                            options={opcionesFiltros.operadores}
                            placeholder="Seleccionar operador"
                            showClear
                            filter
                        />
                        </div>
                        
                        <div className="field">
                        <label>Material</label>
                        <Dropdown 
                            value={filtros.material} 
                            onChange={(e) => setFiltros({...filtros, material: e.value})}
                            options={opcionesFiltros.materiales}
                            placeholder="Seleccionar material"
                            showClear
                            filter
                        />
                        </div>
                        <div className="field">
                        <label>Origen</label>
                        <Dropdown 
                            value={filtros.origen} 
                            onChange={(e) => setFiltros({...filtros, origen: e.value})}
                            options={opcionesFiltros.origenes}
                            placeholder="Seleccionar origen"
                            showClear
                            filter
                        />
                        </div>

                        <div className="field">
                        <label>Destino</label>
                        <Dropdown
                            value={filtros.destino}
                            onChange={(e) => setFiltros({...filtros, destino: e.value})}
                            options={opcionesFiltros.destinos}
                            placeholder="Seleccionar destino"
                            showClear
                            filter
                        />
                        </div>

                        <div className="field">
                        <label>Estatus</label>
                        <Dropdown
                            value={filtros.estatus}
                            onChange={(e) => setFiltros({...filtros, estatus: e.value})}
                            options={OPCIONES_ESTATUS_FILTRO}
                            placeholder="Seleccionar estatus"
                            showClear
                        />
                        </div>
                    </div>
                    
                    <div className="flex justify-content-between gap-2 mt-4">
                        <Button 
                        label="Limpiar Filtros" 
                        icon="pi pi-times" 
                        className="p-button-text" 
                        onClick={limpiarFiltros}
                        disabled={loading.viajes}
                        />
                        <div className="flex gap-2">
                        <Button 
                            label="Cancelar" 
                            icon="pi pi-times" 
                            className="p-button-text" 
                            onClick={() => setShowFiltros(false)}
                            disabled={loading.viajes}
                        />
                        <Button 
                            label="Aplicar Filtros" 
                            icon="pi pi-check" 
                            onClick={aplicarFiltros}
                            loading={loading.viajes}
                        />
                        </div>
                    </div>
                </Dialog>

                    <Dialog visible={deleteViajeDialog} style={{ width: '450px' }} header="Confirm" modal footer={deleteViajeDialogFooter} onHide={hideDeleteViajeDialog}>
                        <div className="flex align-items-center justify-content-center">
                            <i className="pi pi-exclamation-triangle mr-3" style={{ fontSize: '2rem' }} />
                            {viaje && (
                                <span>
                                    Estas seguro de Eliminar el Id <b>{viaje.id}</b>?
                                </span>
                            )}
                        </div>
                    </Dialog>

                    <Dialog visible={deleteViajesDialog} style={{ width: '450px' }} header="Confirm" modal footer={deleteViajesDialogFooter} onHide={hideDeleteViajesDialog}>
                        <div className="flex align-items-center justify-content-center">
                            <i className="pi pi-exclamation-triangle mr-3" style={{ fontSize: '2rem' }} />
                            {viaje && <span>Estas seguro de Eliminar los seleccionados?</span>}
                        </div>
                    </Dialog>
                </div>
            </div>
        </div>
    );
};

export default Crud;

function setViajesFiltrados(value: ViajeEstimacion[]): ViajeEstimacion[] | PromiseLike<ViajeEstimacion[]> {
    throw new Error('Function not implemented.');
}
