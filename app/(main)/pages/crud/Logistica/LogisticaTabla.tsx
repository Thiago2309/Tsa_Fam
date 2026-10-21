// app/(main)/pages/crud/Logistica/LogisticaTabla.tsx
'use client';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Toast } from 'primereact/toast';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { 
    fetchViajesLogistica, 
    LogisticaViaje,
    fetchPreciosOrigenDestino,
    fetchMateriales,
    fetchM3,
    fetchOperadores,
    fetchInvitados,
    fetchClientes,
    updateViajeLogistica
} from '../../../../../Services/BD/logistica/logisticaService';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Checkbox } from 'primereact/checkbox';
import { supabase } from '../../../../../Services/superbase.service';
import { buscarTicketDeLogistica, createViaje } from '../../../../../Services/BD/viajeService';
import { anotarM3ManualEnObservaciones, extraerM3ManualDeObservaciones, quitarAnotacionM3Manual } from '../../../../../Services/BD/m3ManualUtil';
import TicketViajeDialog from '../TicketViajeDialog';

const LogisticaTabla = () => {
    const [viajes, setViajes] = useState<LogisticaViaje[]>([]);
    const [loading, setLoading] = useState(false);
    const toast = useRef<Toast>(null);
    // Viaje cuya foto del ticket se está viendo (null = ventana cerrada)
    const [ticketDe, setTicketDe] = useState<LogisticaViaje | null>(null);

    // Estados para el diálogo de edición
    const [editDialog, setEditDialog] = useState(false);
    const [editViaje, setEditViaje] = useState<LogisticaViaje | null>(null);
    const [folioBco, setFolioBco] = useState('');
    const [folio, setFolio] = useState('');
    const [numeroViaje, setNumeroViaje] = useState('');
    const [cantidadViajes, setCantidadViajes] = useState<number | null>(null);
    const [submittedEdit, setSubmittedEdit] = useState(false);
    const [loadingEdit, setLoadingEdit] = useState(false);
    const [observaciones, setObservaciones] = useState('');
    // M3 manual: para camiones externos sin M3 en el catálogo. Si tiene valor, al Aprobar
    // se usa ese número en vez del M3 de catálogo (que aquí solo se muestra de lectura).
    const [m3Manual, setM3Manual] = useState<number | null>(null);
    const [idCliente, setIdCliente] = useState<number | null>(null);
    const [idOperador, setIdOperador] = useState<number | null>(null);
    const [idPrecioOrigenDestino, setIdPrecioOrigenDestino] = useState<number | null>(null);
    const [idMaterial, setIdMaterial] = useState<number | null>(null);
    const [idM3, setIdM3] = useState<number | null>(null);
    const [idInvitado, setIdInvitado] = useState<number | null>(null);
    const [estadoEdit, setEstadoEdit] = useState<string>('pendiente');
    const [horarioEdit, setHorarioEdit] = useState<string>('D');
    const [enRentaEdit, setEnRentaEdit] = useState(false);
    const [horasRentaEdit, setHorasRentaEdit] = useState<number | null>(null);
    const [fechaAsignacionEdit, setFechaAsignacionEdit] = useState<Date | null>(null);

    // Opciones para los dropdowns de edición
    const [clientesOptions, setClientesOptions] = useState<{ id: number; empresa: string }[]>([]);
    const [operadoresOptions, setOperadoresOptions] = useState<{ id: number; nombre: string }[]>([]);
    const [preciosOptions, setPreciosOptions] = useState<{ id: number; label: string }[]>([]);
    const [materialesOptions, setMaterialesOptions] = useState<{ id: number; nombre: string }[]>([]);
    const [m3Options, setM3Options] = useState<{ id: number; nombre: string }[]>([]);
    const [invitadosOptions, setInvitadosOptions] = useState<{ id: number; empresa: string }[]>([]);

    const estadoOptionsEdit = [
        { label: 'Pendiente', value: 'pendiente' },
        { label: 'Asignado', value: 'asignado' },
        { label: 'En Curso', value: 'en_curso' },
        { label: 'Completado', value: 'completado' },
        { label: 'Cancelado', value: 'cancelado' }
    ];

    const horarioOptionsEdit = [
        { label: 'Día', value: 'D' },
        { label: 'Noche', value: 'N' }
    ];

    useEffect(() => {
        const cargarOpciones = async () => {
            try {
                const [clientesData, operadoresData, preciosData, materialesData, m3Data, invitadosData] = await Promise.all([
                    fetchClientes(),
                    fetchOperadores(),
                    fetchPreciosOrigenDestino(),
                    fetchMateriales(),
                    fetchM3(),
                    fetchInvitados()
                ]);
                setClientesOptions(clientesData);
                setOperadoresOptions(operadoresData);
                setPreciosOptions(preciosData);
                setMaterialesOptions(materialesData);
                setM3Options(m3Data);
                setInvitadosOptions(invitadosData);
            } catch (error) {
                console.error('Error cargando opciones de edición:', error);
            }
        };
        cargarOpciones();
    }, []);

    // Cargar datos - usar useCallback para evitar recreación
    const cargarDatos = useCallback(async () => {
        setLoading(true);
        try {
            const viajesData = await fetchViajesLogistica();
            const viajesCompletados = viajesData.filter(v => v.estado === 'completado');
            setViajes(viajesCompletados);
        } catch (error) {
            console.error('Error cargando datos:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: 'Error al cargar los datos',
                life: 3000
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    // Función para cerrar el diálogo
    const cerrarDialog = useCallback(() => {
        setEditDialog(false);
        setEditViaje(null);
        setFolioBco('');
        setFolio('');
        setNumeroViaje('');
        setCantidadViajes(null);
        setObservaciones('');
        setM3Manual(null);
        setIdCliente(null);
        setIdOperador(null);
        setIdPrecioOrigenDestino(null);
        setIdMaterial(null);
        setIdM3(null);
        setIdInvitado(null);
        setEstadoEdit('pendiente');
        setHorarioEdit('D');
        setEnRentaEdit(false);
        setHorasRentaEdit(null);
        setFechaAsignacionEdit(null);
        setSubmittedEdit(false);
    }, []);

    // Función para Editar
    const handleEditar = useCallback((rowData: LogisticaViaje) => {
        setEditViaje(rowData);
        setFolioBco(rowData.folio_bco || '');
        setFolio(rowData.folio || '');
        setNumeroViaje(rowData.numero_viaje || '');
        setCantidadViajes(rowData.cantidad_viajes || null);
        setObservaciones(quitarAnotacionM3Manual(rowData.observaciones) || '');
        setM3Manual(extraerM3ManualDeObservaciones(rowData.observaciones));
        setIdCliente(rowData.id_cliente);
        setIdOperador(rowData.id_operador);
        setIdPrecioOrigenDestino(rowData.id_precio_origen_destino);
        setIdMaterial(rowData.id_material);
        setIdM3(rowData.id_m3);
        setIdInvitado(rowData.id_invitado);
        setEstadoEdit(rowData.estado || 'pendiente');
        setHorarioEdit(rowData.horario || 'D');
        setEnRentaEdit(rowData.en_renta || false);
        setHorasRentaEdit(rowData.horas_renta || null);
        setFechaAsignacionEdit(rowData.fecha_asignacion ? new Date(rowData.fecha_asignacion) : null);
        setSubmittedEdit(false);
        setEditDialog(true);
    }, []);

    // Función para guardar la edición
    const guardarEdicion = useCallback(async () => {
        setSubmittedEdit(true);
        
        // if (!folio || folio.trim() === '') {
        //     toast.current?.show({
        //         severity: 'error',
        //         summary: 'Error',
        //         detail: 'El campo Folio es obligatorio',
        //         life: 3000
        //     });
        //     return;
        // }

        try {
            setLoadingEdit(true);

            const observacionesFinal = anotarM3ManualEnObservaciones(m3Manual, observaciones);

            const datosActualizar = {
                id: editViaje?.id,
                folio: folio.trim(),
                folio_bco: folioBco || null,
                numero_viaje: numeroViaje || null,
                cantidad_viajes: cantidadViajes || null,
                id_cliente: idCliente,
                id_operador: idOperador,
                id_precio_origen_destino: idPrecioOrigenDestino,
                id_material: idMaterial,
                id_m3: idM3,
                id_invitado: idInvitado,
                estado: estadoEdit,
                observaciones: observacionesFinal,
                fecha_asignacion: fechaAsignacionEdit ? fechaAsignacionEdit.toISOString().split('T')[0] : null,
                horario: horarioEdit,
                en_renta: enRentaEdit,
                horas_renta: enRentaEdit ? horasRentaEdit : null
            };

            console.log('Datos a actualizar:', datosActualizar);

            await updateViajeLogistica(datosActualizar as LogisticaViaje);

            // Recargar los datos para reflejar todos los campos editados (incluyendo nombres relacionados)
            await cargarDatos();

            toast.current?.show({
                severity: 'success',
                summary: 'Éxito',
                detail: 'Datos actualizados correctamente',
                life: 3000
            });

            cerrarDialog();
            
        } catch (error) {
            console.error('Error:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: 'Error al actualizar los datos',
                life: 3000
            });
        } finally {
            setLoadingEdit(false);
        }
    }, [editViaje, folio, folioBco, numeroViaje, cantidadViajes, observaciones, m3Manual, idCliente, idOperador, idPrecioOrigenDestino, idMaterial, idM3, idInvitado, estadoEdit, horarioEdit, enRentaEdit, horasRentaEdit, fechaAsignacionEdit, cargarDatos, cerrarDialog]);

    // Función para Aprobar
    const handleAprobar = useCallback(async (rowData: LogisticaViaje) => {
        try {
            const [preciosData, materialesData, m3Data] = await Promise.all([
                fetchPreciosOrigenDestino(),
                fetchMateriales(),
                fetchM3()
            ]);

            const precio = preciosData.find(p => p.id === rowData.id_precio_origen_destino);
            const material = materialesData.find(m => m.id === rowData.id_material);
            const m3Item = m3Data.find(m => m.id === rowData.id_m3);
            // Si en observaciones hay un M3 manual anotado (camión externo sin M3 de catálogo),
            // se usa ese valor en vez de requerir un m3Item del catálogo.
            const m3ManualValor = extraerM3ManualDeObservaciones(rowData.observaciones);
            const metrosCubicosEfectivos = m3Item ? m3Item.metros_cubicos : m3ManualValor;

            if (!precio || !material || !metrosCubicosEfectivos) {
                toast.current?.show({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'No se encontraron los datos necesarios para crear el viaje',
                    life: 3000
                });
                return;
            }

            let caphrsviajes;
            let total_materia = 0;

            if (rowData.en_renta && rowData.horas_renta) {
                caphrsviajes = precio.precio_unidad * metrosCubicosEfectivos * rowData.horas_renta;
            } else if (rowData.cantidad_viajes && rowData.cantidad_viajes > 0) {
                caphrsviajes = precio.precio_unidad * metrosCubicosEfectivos * rowData.cantidad_viajes;
            } else {
                caphrsviajes = precio.precio_unidad * metrosCubicosEfectivos;
            }

            if (precio.precio_materia && precio.precio_materia > 0) {
                total_materia = precio.precio_materia * metrosCubicosEfectivos;
            }

            const fechaViaje = rowData.fecha_asignacion 
                ? new Date(rowData.fecha_asignacion).toISOString().split('T')[0] 
                : new Date().toISOString().split('T')[0];
            
            const numeroViajeNum = rowData.numero_viaje != null && rowData.numero_viaje !== ''
                ? Number(rowData.numero_viaje)
                : null;

            const idInvitado = rowData.id_invitado ? String(rowData.id_invitado) : null;

            // Foto del ticket (opcional) que el operador subió desde la app móvil
            // o que se subió aquí. Si no hay, el viaje se aprueba igual que antes.
            const ticket = rowData.id ? await buscarTicketDeLogistica(rowData.id) : null;

            const nuevoViaje = {
                ...(ticket ?? {}),
                id_cliente: rowData.id_cliente,
                fecha: fechaViaje,
                folio_bco: rowData.folio_bco || '',
                folio: rowData.folio,
                id_precio_origen_destino: rowData.id_precio_origen_destino,
                id_material: rowData.id_material,
                id_m3: m3Item ? rowData.id_m3 : null,
                caphrsviajes: caphrsviajes,
                total_materia: total_materia,
                id_operador: rowData.id_operador,
                id_invitado: idInvitado,
                en_renta: rowData.en_renta || false,
                horas_renta: rowData.horas_renta || null,
                horario: rowData.horario || 'D',
                numero_viaje: numeroViajeNum,
                cantidad_viajes: rowData.cantidad_viajes || null,
                observaciones: rowData.observaciones || null
            };

            const result = await createViaje(nuevoViaje);

            if (result) {
                toast.current?.show({
                    severity: 'success',
                    summary: 'Éxito',
                    detail: `Viaje aprobado y creado correctamente con folio: ${rowData.folio}`,
                    life: 3000
                });

                const { error: deleteError } = await supabase
                    .from('logistica')
                    .delete()
                    .eq('id', rowData.id);

                if (deleteError) {
                    console.error('Error eliminando registro:', deleteError);
                }

                cargarDatos();
            }
        } catch (error) {
            console.error('Error al aprobar viaje:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: 'Error al aprobar el viaje',
                life: 3000
            });
        }
    }, [cargarDatos]);

    // Función para Rechazar
    const handleRechazar = useCallback(async (rowData: LogisticaViaje) => {
        try {
            const { error: deleteError } = await supabase
                .from('logistica')
                .delete()
                .eq('id', rowData.id);

            if (deleteError) {
                console.error('Error eliminando registro:', deleteError);
                toast.current?.show({
                    severity: 'error',
                    summary: 'Error',
                    detail: `Error al rechazar el viaje: ${rowData.folio}`,
                    life: 3000
                });
                return;
            }

            toast.current?.show({
                severity: 'info',
                summary: 'Rechazado',
                detail: `Viaje rechazado correctamente con folio: ${rowData.folio}`,
                life: 3000
            });

            cargarDatos();
        } catch (error) {
            console.error('Error al rechazar viaje:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: 'Error al rechazar el viaje',
                life: 3000
            });
        }
    }, [cargarDatos]);

    // Templates para la tabla
    const accionesBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return (
            <div className="flex gap-2">
                <Button 
                    icon="pi pi-pencil" 
                    rounded 
                    size="small"
                    tooltip="Editar Viaje"
                    severity="info" 
                    onClick={() => handleEditar(rowData)}
                    tooltipOptions={{ position: 'top' }}
                />
                <Button
                    icon="pi pi-image"
                    rounded
                    size="small"
                    severity="secondary"
                    tooltip="Ticket de carga"
                    aria-label="Ver ticket de carga"
                    onClick={() => setTicketDe(rowData)}
                    tooltipOptions={{ position: 'top' }}
                />
                <Button
                    icon="pi pi-check"
                    severity="success"
                    rounded
                    size="small"
                    onClick={() => handleAprobar(rowData)}
                    tooltip="Aprobar"
                    tooltipOptions={{ position: 'top' }}
                />
                <Button
                    icon="pi pi-times"
                    severity="danger"
                    rounded
                    size="small"
                    onClick={() => handleRechazar(rowData)}
                    tooltip="Rechazar"
                    tooltipOptions={{ position: 'top' }}
                />
            </div>
        );
    }, [handleEditar, handleAprobar, handleRechazar]);

    const folioBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return <span className="font-bold">{rowData.folio || '-'}</span>;
    }, []);

    const folioBcoBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.folio_bco || '-';
    }, []);

    const cantidadViajesBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.cantidad_viajes || '-';
    }, []);

    const fechaAsignacionBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        if (!rowData.fecha_asignacion) return '-';
        const date = new Date(rowData.fecha_asignacion);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear());
        return `${day}-${month}-${year}`;
    }, []);

    const numeroViajeBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.numero_viaje || '-';
    }, []);

    const clienteBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.cliente_nombre || '-';
    }, []);

    const operadorBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.operador_nombre || '-';
    }, []);

    const invitadoBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.invitado_nombre || '-';
    }, []);

    const origenBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.origen || '-';
    }, []);

    const destinoBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.destino || '-';
    }, []);

    const materialBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.material_nombre || '-';
    }, []);

    const m3BodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.m3_nombre || '-';
    }, []);

    const horarioBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        const horarioMap = {
            'D': 'Día',
            'N': 'Noche'
        };
        return horarioMap[rowData.horario as keyof typeof horarioMap] || rowData.horario || '-';
    }, []);

    const rentaBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.en_renta ? (
            <div className="flex align-items-center">
                <i className="pi pi-check-circle text-green-500 mr-2" />
                <span>{rowData.horas_renta?.toFixed(2) || '0.00'} hrs</span>
            </div>
        ) : (
            <div className="flex align-items-center">
                <i className="pi pi-times-circle text-red-500 mr-2" />
                <span>No</span>
            </div>
        );
    }, []);

    const observacionesBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        return rowData.observaciones || '-';
    }, []);

    const estadoBodyTemplate = useCallback((rowData: LogisticaViaje) => {
        const getEstadoColor = (estado: string) => {
            switch (estado) {
                case 'pendiente': return 'bg-orange-100 text-orange-800';
                case 'asignado': return 'bg-blue-100 text-blue-800';
                case 'en_curso': return 'bg-cyan-100 text-cyan-800';
                case 'completado': return 'bg-green-100 text-green-800';
                case 'cancelado': return 'bg-red-100 text-red-800';
                default: return 'bg-gray-100 text-gray-800';
            }
        };

        const estadoOptions = [
            { label: 'Pendiente', value: 'pendiente' },
            { label: 'Asignado', value: 'asignado' },
            { label: 'En Curso', value: 'en_curso' },
            { label: 'Completado', value: 'completado' },
            { label: 'Cancelado', value: 'cancelado' }
        ];

        const estadoLabel = estadoOptions.find(e => e.value === rowData.estado)?.label || rowData.estado;
        
        return (
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getEstadoColor(rowData.estado)}`}>
                {estadoLabel}
            </span>
        );
    }, []);

    return (
        <div className="card">
            <Toast ref={toast} />
            <TicketViajeDialog
                origen={ticketDe?.id ? { tipo: 'logistica', id: ticketDe.id } : null}
                folio={ticketDe?.folio}
                onHide={() => setTicketDe(null)}
            />

            <div className="flex justify-content-between align-items-center mb-3">
                <div className="flex align-items-center gap-2">
                    <Button 
                        icon="pi pi-refresh" 
                        severity="secondary" 
                        rounded 
                        label="Recargar" 
                        onClick={cargarDatos} 
                        loading={loading}
                        tooltip="Recargar datos"
                        tooltipOptions={{ position: 'top' }}
                    />
                </div>
            </div>
            
            <DataTable
                value={viajes}
                dataKey="id"
                paginator
                rows={10}
                rowsPerPageOptions={[5, 10, 25]}
                className="datatable-responsive"
                paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
                currentPageReportTemplate="Mostrando {first} a {last} de {totalRecords} viajes completados"
                emptyMessage="No hay viajes completados"
                responsiveLayout="scroll"
                loading={loading}
                globalFilterFields={['folio', 'cliente_nombre', 'operador_nombre', 'origen', 'destino']}
            >
                <Column field="folio" header="Folio" sortable body={folioBodyTemplate} />
                <Column field="folio_bco" header="Folio Bco" sortable body={folioBcoBodyTemplate} />
                <Column field="cantidad_viajes" header="Cant. Viajes" sortable body={cantidadViajesBodyTemplate} />
                <Column field="fecha_asignacion" header="Fecha Asignación" sortable body={fechaAsignacionBodyTemplate} />
                <Column field="numero_viaje" header="Número de Viaje" sortable body={numeroViajeBodyTemplate} />
                <Column field="cliente_nombre" header="Cliente" sortable body={clienteBodyTemplate} />
                <Column field="operador_nombre" header="Operador" sortable body={operadorBodyTemplate} />
                <Column field="invitado_nombre" header="Invitado" sortable body={invitadoBodyTemplate} />
                <Column field="origen" header="Origen" sortable body={origenBodyTemplate} />
                <Column field="destino" header="Destino" sortable body={destinoBodyTemplate} />
                <Column field="material_nombre" header="Material" sortable body={materialBodyTemplate} />
                <Column field="m3_nombre" header="M3" sortable body={m3BodyTemplate} />
                <Column field="horario" header="Horario" sortable body={horarioBodyTemplate} />
                <Column field="en_renta" header="Renta" sortable body={rentaBodyTemplate} />
                <Column field="observaciones" header="Observaciones" sortable body={observacionesBodyTemplate} />
                <Column field="estado" header="Estado" sortable body={estadoBodyTemplate} />
                <Column header="Acciones" body={accionesBodyTemplate} headerStyle={{ minWidth: '120px' }} style={{ textAlign: 'center' }} />
            </DataTable>

            {/* Dialog para editar */}
            <Dialog
                visible={editDialog}
                header="Editar Viaje Logístico"
                modal
                className="p-fluid"
                style={{ width: '550px' }}
                breakpoints={{ '960px': '80vw', '641px': '95vw' }}
                footer={
                    <>
                        <Button 
                            label="Cancelar" 
                            icon="pi pi-times" 
                            text 
                            onClick={cerrarDialog}
                        />
                        <Button 
                            label="Guardar" 
                            icon="pi pi-check" 
                            text 
                            onClick={guardarEdicion}
                            loading={loadingEdit}
                        />
                    </>
                }
                onHide={cerrarDialog}
            >
                <div className="field">
                    <label htmlFor="folio">Folio</label>
                    <InputText
                        id="folio"
                        value={folio}
                        onChange={(e) => setFolio(e.target.value)}
                        placeholder="Ingresa el folio"
                    />
                </div>

                <div className="field">
                    <label htmlFor="folio_bco">Folio Bancario</label>
                    <InputText
                        id="folio_bco"
                        value={folioBco}
                        onChange={(e) => setFolioBco(e.target.value)}
                        placeholder="Ingresa el folio bancario"
                    />
                </div>

                <div className="field">
                    <label htmlFor="numero_viaje">Número de Viaje</label>
                    <InputText
                        id="numero_viaje"
                        value={numeroViaje}
                        onChange={(e) => setNumeroViaje(e.target.value)}
                        placeholder="Ingresa el número de viaje"
                    />
                </div>

                <div className="field">
                    <label htmlFor="cantidad_viajes">Cantidad de Viajes</label>
                    <InputNumber
                        id="cantidad_viajes"
                        value={cantidadViajes}
                        onValueChange={(e) => setCantidadViajes(e.value ?? null)}
                        placeholder="Ingresa la cantidad de viajes"
                        min={0}
                        useGrouping={false}
                        className="w-full"
                        mode="decimal"
                    />
                </div>

                <div className="field">
                    <label htmlFor="fecha_asignacion">Fecha de Asignación</label>
                    <Calendar
                        id="fecha_asignacion"
                        value={fechaAsignacionEdit}
                        onChange={(e) => setFechaAsignacionEdit((e.value as Date) ?? null)}
                        dateFormat="dd/mm/yy"
                        showIcon
                        className="w-full"
                    />
                </div>

                <div className="field">
                    <label htmlFor="cliente">Cliente</label>
                    <Dropdown
                        id="cliente"
                        value={idCliente}
                        options={clientesOptions}
                        optionLabel="empresa"
                        optionValue="id"
                        onChange={(e) => setIdCliente(e.value)}
                        placeholder="Selecciona un cliente"
                        filter
                        showClear
                        className="w-full"
                    />
                </div>

                <div className="field">
                    <label htmlFor="operador">Operador</label>
                    <Dropdown
                        id="operador"
                        value={idOperador}
                        options={operadoresOptions}
                        optionLabel="nombre"
                        optionValue="id"
                        onChange={(e) => setIdOperador(e.value)}
                        placeholder="Selecciona un operador"
                        filter
                        showClear
                        className="w-full"
                    />
                </div>

                <div className="field">
                    <label htmlFor="invitado">Invitado</label>
                    <Dropdown
                        id="invitado"
                        value={idInvitado}
                        options={invitadosOptions}
                        optionLabel="empresa"
                        optionValue="id"
                        onChange={(e) => setIdInvitado(e.value)}
                        placeholder="Selecciona un invitado"
                        filter
                        showClear
                        className="w-full"
                    />
                </div>

                <div className="field">
                    <label htmlFor="origen_destino">Origen - Destino</label>
                    <Dropdown
                        id="origen_destino"
                        value={idPrecioOrigenDestino}
                        options={preciosOptions}
                        optionLabel="label"
                        optionValue="id"
                        onChange={(e) => setIdPrecioOrigenDestino(e.value)}
                        placeholder="Selecciona origen - destino"
                        filter
                        showClear
                        className="w-full"
                    />
                </div>

                <div className="field">
                    <label htmlFor="material">Material</label>
                    <Dropdown
                        id="material"
                        value={idMaterial}
                        options={materialesOptions}
                        optionLabel="nombre"
                        optionValue="id"
                        onChange={(e) => setIdMaterial(e.value)}
                        placeholder="Selecciona un material"
                        filter
                        showClear
                        className="w-full"
                    />
                </div>

                <div className="field">
                    <label htmlFor="m3">M3 (Catálogo)</label>
                    <Dropdown
                        id="m3"
                        value={idM3}
                        options={m3Options}
                        optionLabel="nombre"
                        optionValue="id"
                        onChange={(e) => setIdM3(e.value)}
                        placeholder="Selecciona un M3 de catálogo"
                        filter
                        showClear
                        className="w-full"
                    />
                </div>

                <div className="field">
                    <label htmlFor="horario">Horario</label>
                    <Dropdown
                        id="horario"
                        value={horarioEdit}
                        options={horarioOptionsEdit}
                        onChange={(e) => setHorarioEdit(e.value)}
                        placeholder="Selecciona el horario"
                        className="w-full"
                    />
                </div>

                <div className="field">
                    <label htmlFor="estado">Estado</label>
                    <Dropdown
                        id="estado"
                        value={estadoEdit}
                        options={estadoOptionsEdit}
                        onChange={(e) => setEstadoEdit(e.value)}
                        placeholder="Selecciona el estado"
                        className="w-full"
                    />
                </div>

                <div className="field-checkbox flex align-items-center gap-2">
                    <Checkbox
                        inputId="en_renta"
                        checked={enRentaEdit}
                        onChange={(e) => setEnRentaEdit(e.checked ?? false)}
                    />
                    <label htmlFor="en_renta">En Renta</label>
                </div>

                {enRentaEdit && (
                    <div className="field">
                        <label htmlFor="horas_renta">Horas de Renta</label>
                        <InputNumber
                            id="horas_renta"
                            value={horasRentaEdit}
                            onValueChange={(e) => setHorasRentaEdit(e.value ?? null)}
                            placeholder="Ingresa las horas de renta"
                            min={0}
                            mode="decimal"
                            minFractionDigits={0}
                            maxFractionDigits={2}
                            className="w-full"
                        />
                    </div>
                )}

                <div className="field">
                    <label htmlFor="m3_manual">M3 (Manual)</label>
                    <InputNumber
                        id="m3_manual"
                        value={m3Manual}
                        onValueChange={(e) => setM3Manual(e.value ?? null)}
                        mode="decimal"
                        min={0}
                        minFractionDigits={0}
                        maxFractionDigits={2}
                        placeholder="Para camión externo sin M3 de catálogo"
                        className="w-full"
                    />
                    <small className="text-500">
                        Solo para camiones externos que no están en el catálogo. Si se deja vacío, al Aprobar se usará el M3 del catálogo: {editViaje?.m3_nombre || 'sin definir'}.
                    </small>
                </div>

                <div className="field">
                    <label htmlFor="observaciones">Observaciones</label>
                    <InputText
                        id="observaciones"
                        value={observaciones}
                        onChange={(e) => {setObservaciones(e.target.value);}}
                        placeholder="Escriba alguna observación"
                    />
                </div>

            </Dialog>
        </div>
    );
};

export default LogisticaTabla;