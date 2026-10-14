'use client';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Toast } from 'primereact/toast';
import { Toolbar } from 'primereact/toolbar';
import { Calendar } from 'primereact/calendar';
import { InputNumber } from 'primereact/inputnumber';
import { Dropdown } from 'primereact/dropdown';
import { SelectButton } from 'primereact/selectbutton';
import { Tag } from 'primereact/tag';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { fetchCajaChica, createCajaChica, updateCajaChica, deleteCajaChica, CajaChica } from '../../../../Services/BD/cajaChicaService';

// Origen del movimiento, deducido de la descripción que ponen los registros automáticos
// (combustibleService -> 'COMBUSTIBLE', gastoService -> 'GASTO - ...', cuentasPorCobrarService -> 'ABONO - ...').
type OrigenCajaChica = 'Combustible' | 'Gasto' | 'Abono cliente' | 'Manual';
type TipoMovimiento = 'todos' | 'ingreso' | 'egreso';
type Periodo = 'mes' | 'mesAnterior' | 'anio' | 'todo' | 'personalizado';

const obtenerOrigen = (descripcion: string): OrigenCajaChica => {
    const d = (descripcion || '').trim().toUpperCase();
    if (d.startsWith('COMBUSTIBLE')) return 'Combustible';
    if (d.startsWith('GASTO')) return 'Gasto';
    if (d.startsWith('ABONO')) return 'Abono cliente';
    return 'Manual';
};

const severidadOrigen: Record<OrigenCajaChica, 'warning' | 'danger' | 'success' | 'info'> = {
    Combustible: 'warning',
    Gasto: 'danger',
    'Abono cliente': 'success',
    Manual: 'info'
};

const formatMoneda = (valor: number) => valor.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const aFechaTexto = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

const aFecha = (texto: string) => {
    const [year, month, day] = texto.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
};

const rangoDePeriodo = (periodo: Periodo): [Date, Date] | null => {
    const hoy = new Date();
    switch (periodo) {
        case 'mes':
            return [new Date(hoy.getFullYear(), hoy.getMonth(), 1), new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)];
        case 'mesAnterior':
            return [new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1), new Date(hoy.getFullYear(), hoy.getMonth(), 0)];
        case 'anio':
            return [new Date(hoy.getFullYear(), 0, 1), new Date(hoy.getFullYear(), 11, 31)];
        default:
            return null;
    }
};

const opcionesPeriodo = [
    { label: 'Este mes', value: 'mes' },
    { label: 'Mes anterior', value: 'mesAnterior' },
    { label: 'Este año', value: 'anio' },
    { label: 'Todo', value: 'todo' }
];

const opcionesTipo = [
    { label: 'Todos', value: 'todos' },
    { label: 'Ingresos', value: 'ingreso' },
    { label: 'Egresos', value: 'egreso' }
];

const opcionesOrigen = [
    { label: 'Todos los orígenes', value: null },
    { label: 'Combustible', value: 'Combustible' },
    { label: 'Gastos / Refacciones', value: 'Gasto' },
    { label: 'Abonos de clientes', value: 'Abono cliente' },
    { label: 'Captura manual', value: 'Manual' }
];

const CajaChicaCrud = () => {
    let emptyCajaChica: CajaChica = {
        fecha: '',
        descripcion: '',
        ingreso: null,
        egreso: null
    };

    const [cajaChicaList, setCajaChicaList] = useState<CajaChica[]>([]);
    const [loading, setLoading] = useState(true);
    const [cajaChicaDialog, setCajaChicaDialog] = useState(false);
    const [deleteCajaChicaDialog, setDeleteCajaChicaDialog] = useState(false);
    const [deleteCajaChicasDialog, setDeleteCajaChicasDialog] = useState(false);
    const [cajaChica, setCajaChica] = useState<CajaChica>(emptyCajaChica);
    const [selectedCajaChicas, setSelectedCajaChicas] = useState<CajaChica[]>([]);
    const [submitted, setSubmitted] = useState(false);
    const toast = useRef<Toast>(null);
    const dt = useRef<DataTable<any>>(null);

    // Filtros
    const [periodo, setPeriodo] = useState<Periodo>('mes');
    const [rangoFechas, setRangoFechas] = useState<(Date | null)[] | null>(rangoDePeriodo('mes'));
    const [tipo, setTipo] = useState<TipoMovimiento>('todos');
    const [origen, setOrigen] = useState<OrigenCajaChica | null>(null);
    const [busqueda, setBusqueda] = useState('');

    const cargarCajaChica = async () => {
        setLoading(true);
        try {
            setCajaChicaList(await fetchCajaChica());
        } catch (error) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la caja chica', life: 3000 });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargarCajaChica();
    }, []);

    // Saldo general (todos los movimientos, sin filtros)
    const saldoTotal = useMemo(() => cajaChicaList.reduce((total, item) => total + (item.ingreso || 0) - (item.egreso || 0), 0), [cajaChicaList]);

    // Saldo acumulado después de cada movimiento, en orden cronológico
    const saldoAcumuladoPorId = useMemo(() => {
        const ordenados = [...cajaChicaList].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.id ?? 0) - (b.id ?? 0));
        const mapa = new Map<number, number>();
        let acumulado = 0;
        ordenados.forEach((item) => {
            acumulado += (item.ingreso || 0) - (item.egreso || 0);
            if (item.id != null) mapa.set(item.id, acumulado);
        });
        return mapa;
    }, [cajaChicaList]);

    const listaFiltrada = useMemo(() => {
        const desde = rangoFechas?.[0] ? aFechaTexto(rangoFechas[0]) : null;
        const hasta = rangoFechas?.[1] ? aFechaTexto(rangoFechas[1]) : desde;
        const texto = busqueda.trim().toLowerCase();

        return cajaChicaList
            .filter((item) => {
                const fecha = (item.fecha || '').slice(0, 10);
                if (desde && fecha < desde) return false;
                if (hasta && fecha > hasta) return false;
                if (tipo === 'ingreso' && !item.ingreso) return false;
                if (tipo === 'egreso' && !item.egreso) return false;
                if (origen && obtenerOrigen(item.descripcion) !== origen) return false;
                if (texto && !(item.descripcion || '').toLowerCase().includes(texto) && !String(item.ingreso ?? '').includes(texto) && !String(item.egreso ?? '').includes(texto)) return false;
                return true;
            })
            .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.id ?? 0) - (a.id ?? 0));
    }, [cajaChicaList, rangoFechas, tipo, origen, busqueda]);

    const totalIngresos = useMemo(() => listaFiltrada.reduce((total, item) => total + (item.ingreso || 0), 0), [listaFiltrada]);
    const totalEgresos = useMemo(() => listaFiltrada.reduce((total, item) => total + (item.egreso || 0), 0), [listaFiltrada]);
    const numIngresos = listaFiltrada.filter((item) => item.ingreso).length;
    const numEgresos = listaFiltrada.filter((item) => item.egreso).length;
    const balancePeriodo = totalIngresos - totalEgresos;

    // Desglose de egresos por origen dentro del periodo filtrado
    const egresosPorOrigen = useMemo(() => {
        const totales: Record<string, number> = {};
        listaFiltrada.forEach((item) => {
            if (!item.egreso) return;
            const o = obtenerOrigen(item.descripcion);
            totales[o] = (totales[o] || 0) + item.egreso;
        });
        return Object.entries(totales)
            .map(([nombre, total]) => ({ nombre: nombre as OrigenCajaChica, total }))
            .sort((a, b) => b.total - a.total);
    }, [listaFiltrada]);

    const textoPeriodo = useMemo(() => {
        if (!rangoFechas?.[0]) return 'todo el historial';
        const fmt = (f: Date) => f.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
        return rangoFechas[1] ? `${fmt(rangoFechas[0])} - ${fmt(rangoFechas[1])}` : fmt(rangoFechas[0]);
    }, [rangoFechas]);

    const cambiarPeriodo = (nuevo: Periodo | null) => {
        if (!nuevo) return;
        setPeriodo(nuevo);
        setRangoFechas(rangoDePeriodo(nuevo));
    };

    const limpiarFiltros = () => {
        cambiarPeriodo('mes');
        setTipo('todos');
        setOrigen(null);
        setBusqueda('');
    };

    const openNew = () => {
        setCajaChica({ ...emptyCajaChica, fecha: aFechaTexto(new Date()) });
        setSubmitted(false);
        setCajaChicaDialog(true);
    };

    const hideDialog = () => {
        setSubmitted(false);
        setCajaChicaDialog(false);
    };

    const hideDeleteCajaChicaDialog = () => {
        setDeleteCajaChicaDialog(false);
    };

    const hideDeleteCajaChicasDialog = () => {
        setDeleteCajaChicasDialog(false);
    };

    const saveCajaChica = async () => {
        setSubmitted(true);

        if (cajaChica.fecha && cajaChica.descripcion.trim() && (cajaChica.ingreso !== null || cajaChica.egreso !== null)) {
            try {
                if (cajaChica.id) {
                    const updatedCajaChica = await updateCajaChica(cajaChica);
                    setCajaChicaList(cajaChicaList.map((c) => (c.id === updatedCajaChica.id ? updatedCajaChica : c)));
                    toast.current?.show({ severity: 'success', summary: 'Actualizado', detail: 'Movimiento actualizado', life: 3000 });
                } else {
                    const newCajaChica = await createCajaChica(cajaChica);
                    setCajaChicaList([...cajaChicaList, newCajaChica]);
                    toast.current?.show({ severity: 'success', summary: 'Guardado Correctamente', detail: 'Movimiento registrado', life: 3000 });
                }
                setCajaChicaDialog(false);
                setCajaChica(emptyCajaChica);
            } catch (error) {
                toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Error al guardar la Caja Chica', life: 3000 });
            }
        }
    };

    const editCajaChica = (cajaChica: CajaChica) => {
        setCajaChica({ ...cajaChica });
        setCajaChicaDialog(true);
    };

    const confirmDeleteCajaChica = (cajaChica: CajaChica) => {
        setCajaChica(cajaChica);
        setDeleteCajaChicaDialog(true);
    };

    const deleteCajaChicaConfirmado = async () => {
        try {
            await deleteCajaChica(cajaChica.id!);
            setCajaChicaList(cajaChicaList.filter((c) => c.id !== cajaChica.id));
            setDeleteCajaChicaDialog(false);
            setCajaChica(emptyCajaChica);
            toast.current?.show({ severity: 'success', summary: 'Eliminado', detail: 'Movimiento eliminado', life: 3000 });
        } catch (error) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Error al eliminar el movimiento', life: 3000 });
        }
    };

    const exportExcel = () => {
        const filas: Record<string, string | number>[] = listaFiltrada.map((item) => ({
            Id: item.id ?? '',
            Fecha: item.fecha,
            Origen: obtenerOrigen(item.descripcion),
            Descripción: item.descripcion,
            Ingreso: item.ingreso ?? 0,
            Egreso: item.egreso ?? 0,
            'Saldo acumulado': item.id != null ? saldoAcumuladoPorId.get(item.id) ?? 0 : 0
        }));
        filas.push({ Id: '', Fecha: '', Origen: '', Descripción: 'TOTALES DEL PERIODO', Ingreso: totalIngresos, Egreso: totalEgresos, 'Saldo acumulado': balancePeriodo });

        const hoja = XLSX.utils.json_to_sheet(filas);
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Caja Chica');
        XLSX.writeFile(libro, `caja_chica_${aFechaTexto(new Date())}.xlsx`);
    };

    const confirmDeleteSelected = () => {
        setDeleteCajaChicasDialog(true);
    };

    const deleteSelectedCajaChicas = async () => {
        try {
            await Promise.all(selectedCajaChicas.map((c) => deleteCajaChica(c.id!)));
            const idsEliminados = new Set(selectedCajaChicas.map((c) => c.id));
            setCajaChicaList(cajaChicaList.filter((c) => !idsEliminados.has(c.id)));
            setDeleteCajaChicasDialog(false);
            setSelectedCajaChicas([]);
            toast.current?.show({ severity: 'success', summary: 'Eliminados', detail: 'Movimientos eliminados', life: 3000 });
        } catch (error) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Error al eliminar los movimientos', life: 3000 });
        }
    };

    const leftToolbarTemplate = () => {
        return (
            <React.Fragment>
                <div className="my-2">
                    <Button label="Nuevo" icon="pi pi-plus" severity="info" className="mr-2" onClick={openNew} />
                    <Button label="Eliminar" icon="pi pi-trash" severity="danger" onClick={confirmDeleteSelected} disabled={!selectedCajaChicas || !selectedCajaChicas.length} />
                </div>
            </React.Fragment>
        );
    };

    const rightToolbarTemplate = () => {
        return (
            <React.Fragment>
                <Button label="Excel" icon="pi pi-file-excel" severity="success" className="mr-2" onClick={exportExcel} disabled={!listaFiltrada.length} />
                <Button icon="pi pi-refresh" severity="secondary" outlined onClick={cargarCajaChica} tooltip="Recargar" tooltipOptions={{ position: 'bottom' }} />
            </React.Fragment>
        );
    };

    const IdBodyTemplate = (rowData: CajaChica) => (
        <>
            <span className="p-column-title">Id</span>
            {rowData.id}
        </>
    );

    const fechaBodyTemplate = (rowData: CajaChica) => (
        <>
            <span className="p-column-title">Fecha</span>
            {rowData.fecha}
        </>
    );

    const origenBodyTemplate = (rowData: CajaChica) => {
        const o = obtenerOrigen(rowData.descripcion);
        return (
            <>
                <span className="p-column-title">Origen</span>
                <Tag value={o} severity={severidadOrigen[o]} />
            </>
        );
    };

    const descripcionBodyTemplate = (rowData: CajaChica) => (
        <>
            <span className="p-column-title">Descripción</span>
            {rowData.descripcion}
        </>
    );

    const ingresoBodyTemplate = (rowData: CajaChica) => (
        <>
            <span className="p-column-title">Ingreso</span>
            {rowData.ingreso ? <span className="text-green-500 font-medium">{formatMoneda(rowData.ingreso)}</span> : <span className="text-400">-</span>}
        </>
    );

    const egresoBodyTemplate = (rowData: CajaChica) => (
        <>
            <span className="p-column-title">Egreso</span>
            {rowData.egreso ? <span className="text-red-500 font-medium">{formatMoneda(rowData.egreso)}</span> : <span className="text-400">-</span>}
        </>
    );

    const saldoBodyTemplate = (rowData: CajaChica) => {
        const saldo = rowData.id != null ? saldoAcumuladoPorId.get(rowData.id) ?? 0 : 0;
        return (
            <>
                <span className="p-column-title">Saldo</span>
                <span className={saldo >= 0 ? 'text-700' : 'text-red-500'}>{formatMoneda(saldo)}</span>
            </>
        );
    };

    const actionBodyTemplate = (rowData: CajaChica) => (
        <>
            <Button icon="pi pi-pencil" rounded severity="info" className="mr-2" onClick={() => editCajaChica(rowData)} />
            <Button icon="pi pi-trash" rounded severity="danger" onClick={() => confirmDeleteCajaChica(rowData)} />
        </>
    );

    const header = (
        <div className="flex flex-column md:flex-row md:justify-content-between md:align-items-center">
            <h5 className="m-0">Gestión de Caja Chica</h5>
            <span className="block mt-2 md:mt-0 p-input-icon-left">
                <i className="pi pi-search" />
                <InputText type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar descripción o monto..." />
            </span>
        </div>
    );

    const cajaChicaDialogFooter = (
        <>
            <Button label="Cancelar" icon="pi pi-times" text onClick={hideDialog} />
            <Button label="Guardar" icon="pi pi-check" text onClick={saveCajaChica} />
        </>
    );
    const deleteCajaChicaDialogFooter = (
        <>
            <Button label="No" icon="pi pi-times" text onClick={hideDeleteCajaChicaDialog} />
            <Button label="Sí" icon="pi pi-check" text onClick={deleteCajaChicaConfirmado} />
        </>
    );
    const deleteCajaChicasDialogFooter = (
        <>
            <Button label="No" icon="pi pi-times" text onClick={hideDeleteCajaChicasDialog} />
            <Button label="Sí" icon="pi pi-check" text onClick={deleteSelectedCajaChicas} />
        </>
    );

    const tarjeta = (titulo: string, valor: string, pie: string, icono: string, color: 'green' | 'red' | 'blue' | 'orange') => (
        <div className="col-12 md:col-6 xl:col-3">
            <div className="card mb-0 h-full">
                <div className="flex justify-content-between mb-3">
                    <div>
                        <span className="block text-500 font-medium mb-3">{titulo}</span>
                        <div className="font-medium text-xl" style={{ color: `var(--${color}-500)` }}>
                            {valor}
                        </div>
                    </div>
                    <div className="flex align-items-center justify-content-center border-round flex-shrink-0" style={{ width: '2.5rem', height: '2.5rem', backgroundColor: `var(--${color}-100)` }}>
                        <i className={`pi ${icono} text-xl`} style={{ color: `var(--${color}-500)` }} />
                    </div>
                </div>
                <span className="text-500">{pie}</span>
            </div>
        </div>
    );

    return (
        <div className="grid crud-demo">
            <Toast ref={toast} />

            {/* Tarjetas */}
            {tarjeta('Saldo actual de caja', formatMoneda(saldoTotal), 'Todos los movimientos registrados', 'pi-wallet', saldoTotal >= 0 ? 'blue' : 'red')}
            {tarjeta('Ingresos', formatMoneda(totalIngresos), `${numIngresos} movimientos · ${textoPeriodo}`, 'pi-arrow-down-left', 'green')}
            {tarjeta('Egresos', formatMoneda(totalEgresos), `${numEgresos} movimientos · ${textoPeriodo}`, 'pi-arrow-up-right', 'red')}
            {tarjeta('Balance del periodo', formatMoneda(balancePeriodo), balancePeriodo >= 0 ? 'Entró más de lo que salió' : 'Salió más de lo que entró', 'pi-chart-line', balancePeriodo >= 0 ? 'green' : 'orange')}

            {/* Filtros */}
            <div className="col-12 lg:col-8">
                <div className="card mb-0 h-full">
                    <div className="flex justify-content-between align-items-center mb-3">
                        <h5 className="m-0">Filtros</h5>
                        <Button label="Limpiar" icon="pi pi-filter-slash" text size="small" onClick={limpiarFiltros} />
                    </div>
                    <div className="mb-3 overflow-x-auto">
                        <SelectButton value={periodo === 'personalizado' ? null : periodo} options={opcionesPeriodo} onChange={(e) => cambiarPeriodo(e.value)} />
                    </div>
                    <div className="grid p-fluid">
                        <div className="col-12 md:col-4">
                            <label className="block text-500 mb-2">Rango de fechas</label>
                            <Calendar
                                value={rangoFechas as any}
                                onChange={(e) => {
                                    setRangoFechas((e.value as (Date | null)[]) ?? null);
                                    setPeriodo('personalizado');
                                }}
                                selectionMode="range"
                                readOnlyInput
                                dateFormat="dd/mm/yy"
                                placeholder="Todas las fechas"
                                showIcon
                                showButtonBar
                            />
                        </div>
                        <div className="col-12 md:col-4">
                            <label className="block text-500 mb-2">Tipo</label>
                            <Dropdown value={tipo} options={opcionesTipo} onChange={(e) => setTipo(e.value)} />
                        </div>
                        <div className="col-12 md:col-4">
                            <label className="block text-500 mb-2">Origen</label>
                            <Dropdown value={origen} options={opcionesOrigen} onChange={(e) => setOrigen(e.value)} placeholder="Todos los orígenes" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Desglose de egresos */}
            <div className="col-12 lg:col-4">
                <div className="card mb-0 h-full">
                    <h5 className="mt-0 mb-3">¿En qué se fue el dinero?</h5>
                    {egresosPorOrigen.length === 0 ? (
                        <span className="text-500">Sin egresos en el periodo.</span>
                    ) : (
                        egresosPorOrigen.map(({ nombre, total }) => {
                            const porcentaje = totalEgresos ? Math.round((total / totalEgresos) * 100) : 0;
                            return (
                                <div key={nombre} className="mb-3">
                                    <div className="flex justify-content-between mb-1">
                                        <span className="font-medium">{nombre}</span>
                                        <span className="text-600">
                                            {formatMoneda(total)} · {porcentaje}%
                                        </span>
                                    </div>
                                    <div className="surface-200 border-round overflow-hidden" style={{ height: '0.5rem' }}>
                                        <div className="h-full" style={{ width: `${porcentaje}%`, backgroundColor: `var(--${{ Combustible: 'orange', Gasto: 'red', 'Abono cliente': 'green', Manual: 'blue' }[nombre]}-500)` }} />
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <div className="col-12">
                <div className="card">
                    <Toolbar className="mb-4" left={leftToolbarTemplate} right={rightToolbarTemplate}></Toolbar>

                    <DataTable
                        ref={dt}
                        value={listaFiltrada}
                        loading={loading}
                        selection={selectedCajaChicas}
                        onSelectionChange={(e) => setSelectedCajaChicas(e.value)}
                        dataKey="id"
                        paginator
                        rows={10}
                        rowsPerPageOptions={[10, 25, 50, 100]}
                        className="datatable-responsive"
                        paginatorTemplate="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport RowsPerPageDropdown"
                        currentPageReportTemplate="Mostrando {first} a {last} de {totalRecords} movimientos"
                        emptyMessage="No se encontraron movimientos con estos filtros."
                        header={header}
                        responsiveLayout="scroll"
                    >
                        <Column selectionMode="multiple" headerStyle={{ width: '4rem' }}></Column>
                        <Column field="id" header="Id" sortable body={IdBodyTemplate}></Column>
                        <Column field="fecha" header="Fecha" sortable body={fechaBodyTemplate}></Column>
                        <Column header="Origen" body={origenBodyTemplate}></Column>
                        <Column field="descripcion" header="Descripción" sortable body={descripcionBodyTemplate}></Column>
                        <Column field="ingreso" header="Ingreso" sortable body={ingresoBodyTemplate}></Column>
                        <Column field="egreso" header="Egreso" sortable body={egresoBodyTemplate}></Column>
                        <Column header="Saldo acumulado" body={saldoBodyTemplate}></Column>
                        <Column body={actionBodyTemplate} headerStyle={{ minWidth: '10rem' }}></Column>
                    </DataTable>

                    <Dialog visible={cajaChicaDialog} style={{ width: '450px' }} header="Detalles de Caja Chica" modal className="p-fluid" footer={cajaChicaDialogFooter} onHide={hideDialog}>
                        <div className="field">
                            <label htmlFor="fecha">Fecha</label>
                            <Calendar
                                id="fecha"
                                value={cajaChica.fecha ? aFecha(cajaChica.fecha) : null}
                                onChange={(e) => setCajaChica({ ...cajaChica, fecha: e.value ? aFechaTexto(e.value as Date) : '' })}
                                dateFormat="yy-mm-dd"
                                showIcon
                                required
                                className={submitted && !cajaChica.fecha ? 'p-invalid' : ''}
                            />
                            {submitted && !cajaChica.fecha && <small className="p-invalid">Fecha es requerido.</small>}
                        </div>
                        <div className="field">
                            <label htmlFor="descripcion">Descripción</label>
                            <InputText
                                id="descripcion"
                                value={cajaChica.descripcion}
                                onChange={(e) => setCajaChica({ ...cajaChica, descripcion: e.target.value })}
                                required
                                className={submitted && !cajaChica.descripcion ? 'p-invalid' : ''}
                            />
                            {submitted && !cajaChica.descripcion && <small className="p-invalid">Descripción es requerido.</small>}
                        </div>
                        <div className="field">
                            <label htmlFor="ingreso">Ingreso</label>
                            <InputNumber
                                id="ingreso"
                                value={cajaChica.ingreso}
                                onValueChange={(e) => setCajaChica({ ...cajaChica, ingreso: e.value ?? null })}
                                mode="currency"
                                currency="MXN"
                                locale="es-MX"
                                minFractionDigits={2}
                                maxFractionDigits={2}
                                className="w-full"
                            />
                        </div>

                        <div className="field">
                            <label htmlFor="egreso">Egreso</label>
                            <InputNumber
                                id="egreso"
                                value={cajaChica.egreso}
                                onValueChange={(e) => setCajaChica({ ...cajaChica, egreso: e.value ?? null })}
                                mode="currency"
                                currency="MXN"
                                locale="es-MX"
                                minFractionDigits={2}
                                maxFractionDigits={2}
                                className="w-full"
                            />
                            {submitted && cajaChica.ingreso === null && cajaChica.egreso === null && <small className="p-error">Captura un ingreso o un egreso.</small>}
                        </div>
                    </Dialog>

                    <Dialog visible={deleteCajaChicaDialog} style={{ width: '450px' }} header="Confirmar" modal footer={deleteCajaChicaDialogFooter} onHide={hideDeleteCajaChicaDialog}>
                        <div className="flex align-items-center justify-content-center">
                            <i className="pi pi-exclamation-triangle mr-3" style={{ fontSize: '2rem' }} />
                            {cajaChica && (
                                <span>
                                    ¿Está seguro de eliminar <b>{cajaChica.descripcion}</b>?
                                </span>
                            )}
                        </div>
                    </Dialog>

                    <Dialog visible={deleteCajaChicasDialog} style={{ width: '450px' }} header="Confirmar" modal footer={deleteCajaChicasDialogFooter} onHide={hideDeleteCajaChicasDialog}>
                        <div className="flex align-items-center justify-content-center">
                            <i className="pi pi-exclamation-triangle mr-3" style={{ fontSize: '2rem' }} />
                            <span>¿Está seguro de eliminar los {selectedCajaChicas.length} movimientos seleccionados?</span>
                        </div>
                    </Dialog>
                </div>
            </div>
        </div>
    );
};

export default CajaChicaCrud;
