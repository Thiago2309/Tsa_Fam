'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputNumber } from 'primereact/inputnumber';
import { Toast } from 'primereact/toast';
import { Toolbar } from 'primereact/toolbar';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { Tag } from 'primereact/tag';
import { DataTableFilterMeta } from 'primereact/datatable';
import {
    fetchCombustible,
    updateCombustible,
    deleteCombustible,
    fetchOperadores,
    Combustible,
    TipoUnidadCombustible
} from '../../../Services/BD/combustibleService';
import { fetchCamiones, Camion } from '../../../Services/BD/inventario/camion/camionService';
import { fetchMaquinarias, Maquinaria } from '../../../Services/BD/inventario/maquinaria/maquinariaService';
import CombustibleWizardDialog from './CombustibleWizardDialog';
import CombustibleVistaSidebar from './CombustibleVistaSidebar';
import InputLitros from './InputLitros';

const tipoOptions = [
    { label: 'Camión', value: 'camion' },
    { label: 'Maquinaria', value: 'maquinaria' }
];

const CombustiblePage = () => {
    const emptyCombustible: Combustible = {
        fecha: '',
        tipo_equipo: null,
        camion_id: null,
        maquinaria_id: null,
        id_operador: null,
        kilometraje: null,
        horometro: null,
        precio_unitario: null,
        litros: null,
        importe: null
    };

    const [combustibles, setCombustibles] = useState<Combustible[]>([]);
    const [camiones, setCamiones] = useState<Camion[]>([]);
    const [maquinarias, setMaquinarias] = useState<Maquinaria[]>([]);
    const [operadores, setOperadores] = useState<{ id: number; nombre: string }[]>([]);

    const [combustibleDialog, setCombustibleDialog] = useState(false);
    const [wizardDialog, setWizardDialog] = useState(false);
    const [vistaCombustible, setVistaCombustible] = useState<Combustible | null>(null);
    const [deleteCombustibleDialog, setDeleteCombustibleDialog] = useState(false);
    const [deleteCombustiblesDialog, setDeleteCombustiblesDialog] = useState(false);
    const [combustible, setCombustible] = useState<Combustible>(emptyCombustible);
    const [selectedCombustibles, setSelectedCombustibles] = useState<Combustible[]>([]);
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState<DataTableFilterMeta>({
        global: { value: null, matchMode: 'contains' as const }
    });
    const [filtroFechas, setFiltroFechas] = useState<(Date | null)[] | null>(null);
    const [filtroUnidad, setFiltroUnidad] = useState<string | null>(null);
    const [filtroOperador, setFiltroOperador] = useState<number | null>(null);
    const toast = useRef<Toast>(null);
    const dt = useRef<DataTable<any>>(null);

    const cargar = async () => {
        setLoading(true);
        try {
            const data = await fetchCombustible();
            setCombustibles(data);
        } catch (error: any) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargar();
        fetchCamiones().then(setCamiones);
        fetchMaquinarias().then(setMaquinarias);
        fetchOperadores().then(setOperadores);
    }, []);

    // ------- Estadísticas -------
    const totalImporte = combustibles.reduce((total, c) => total + (c.importe || 0), 0);

    const hoy = new Date();
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const ultimoDiaMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    const nombreMes = primerDiaMes.toLocaleString('es', { month: 'long' });
    const registrosDelMes = combustibles.filter(c => {
        const fecha = new Date(c.fecha);
        return fecha >= primerDiaMes && fecha <= ultimoDiaMes;
    });
    const litrosDelMes = registrosDelMes.reduce((total, c) => total + (c.litros || 0), 0);

    const litrosPorOperador: Record<string, number> = {};
    registrosDelMes.forEach(c => {
        if (c.id_operador !== null) {
            const nombre = c.operador_nombre || `Operador ${c.id_operador}`;
            litrosPorOperador[nombre] = (litrosPorOperador[nombre] || 0) + (c.litros || 0);
        }
    });
    let operadorTop: { operador: string; litros: number } | null = null;
    Object.entries(litrosPorOperador).forEach(([operador, litros]) => {
        if (!operadorTop || litros > operadorTop.litros) operadorTop = { operador, litros };
    });

    // ------- Filtros -------
    const unidadOptionsFiltro = [
        ...camiones.map((c) => ({ label: `${c.nombre} (${c.placa})`, value: `camion-${c.id}` })),
        ...maquinarias.map((m) => ({ label: `${m.eco} - ${m.equipo}`, value: `maquinaria-${m.id}` }))
    ];

    const combustiblesFiltrados = combustibles.filter((c) => {
        if (filtroFechas && filtroFechas[0]) {
            const fecha = new Date(c.fecha + 'T00:00:00');
            const desde = new Date(filtroFechas[0]);
            desde.setHours(0, 0, 0, 0);
            const hasta = filtroFechas[1] ? new Date(filtroFechas[1]) : new Date(filtroFechas[0]);
            hasta.setHours(23, 59, 59, 999);
            if (fecha < desde || fecha > hasta) return false;
        }
        if (filtroUnidad) {
            const [tipo, idStr] = filtroUnidad.split('-');
            const id = Number(idStr);
            if (c.tipo_equipo !== tipo) return false;
            if (tipo === 'camion' && c.camion_id !== id) return false;
            if (tipo === 'maquinaria' && c.maquinaria_id !== id) return false;
        }
        if (filtroOperador !== null && c.id_operador !== filtroOperador) return false;
        return true;
    });

    // ------- CRUD -------
    const openNew = () => setWizardDialog(true);

    const hideDialog = () => {
        setSubmitted(false);
        setCombustibleDialog(false);
    };

    const cambiarTipo = (tipo: TipoUnidadCombustible) => {
        setCombustible({
            ...combustible,
            tipo_equipo: tipo,
            camion_id: null,
            maquinaria_id: null,
            kilometraje: tipo === 'camion' ? combustible.kilometraje : null,
            horometro: tipo === 'maquinaria' ? combustible.horometro : null
        });
    };

    const saveCombustible = async () => {
        setSubmitted(true);

        const unidadValida = combustible.tipo_equipo === 'camion' ? !!combustible.camion_id : combustible.tipo_equipo === 'maquinaria' ? !!combustible.maquinaria_id : false;

        if (!combustible.fecha || !combustible.tipo_equipo || !unidadValida || combustible.id_operador === null || !combustible.precio_unitario || !combustible.litros) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: 'Completa los campos requeridos', life: 3000 });
            return;
        }

        try {
            await updateCombustible(combustible);
            toast.current?.show({ severity: 'success', summary: 'Éxito', detail: 'Combustible actualizado', life: 3000 });
            setCombustibleDialog(false);
            setCombustible(emptyCombustible);
            cargar();
        } catch (error: any) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
        }
    };

    const editCombustible = (row: Combustible) => {
        setCombustible({ ...row });
        setCombustibleDialog(true);
    };

    const confirmDeleteCombustible = (row: Combustible) => {
        setCombustible(row);
        setDeleteCombustibleDialog(true);
    };

    const deleteCombustibleConfirmado = async () => {
        try {
            await deleteCombustible(combustible.id!);
            setCombustibles(combustibles.filter(c => c.id !== combustible.id));
            setDeleteCombustibleDialog(false);
            toast.current?.show({ severity: 'success', summary: 'Éxito', detail: 'Combustible eliminado', life: 3000 });
        } catch (error: any) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
        }
    };

    const confirmDeleteSelected = () => setDeleteCombustiblesDialog(true);

    const deleteSelectedCombustibles = async () => {
        try {
            await Promise.all(selectedCombustibles.map(c => deleteCombustible(c.id!)));
            setCombustibles(combustibles.filter(c => !selectedCombustibles.includes(c)));
            setDeleteCombustiblesDialog(false);
            setSelectedCombustibles([]);
            toast.current?.show({ severity: 'success', summary: 'Éxito', detail: 'Combustibles eliminados', life: 3000 });
        } catch (error: any) {
            toast.current?.show({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 });
        }
    };

    const exportCSV = () => dt.current?.exportCSV();

    // ------- Templates -------
    const tipoBodyTemplate = (row: Combustible) => (
        <div className="flex align-items-center gap-2">
            <i className={row.tipo_equipo === 'camion' ? 'pi pi-car' : 'pi pi-cog'} />
            <span>{row.tipo_equipo === 'camion' ? 'Camión' : 'Maquinaria'}</span>
        </div>
    );

    const unidadBodyTemplate = (row: Combustible) =>
        row.tipo_equipo === 'camion'
            ? <span>{row.camion_nombre} {row.camion_placa ? `(${row.camion_placa})` : ''}</span>
            : <span>{row.maquinaria_eco ? `${row.maquinaria_eco} - ` : ''}{row.maquinaria_equipo}</span>;

    const kmHorometroBodyTemplate = (row: Combustible) =>
        row.tipo_equipo === 'camion'
            ? <span>{row.kilometraje != null ? `${row.kilometraje} km` : '-'}</span>
            : <span>{row.horometro != null ? `${row.horometro} hrs` : '-'}</span>;

    const importeBodyTemplate = (row: Combustible) => <span>{(row.importe || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span>;

    const actionBodyTemplate = (row: Combustible) => (
        <div className="flex gap-2">
            <Button icon="pi pi-eye" rounded severity="secondary" onClick={() => setVistaCombustible(row)} tooltip="Vista" />
            <Button icon="pi pi-pencil" rounded severity="info" onClick={() => editCombustible(row)} tooltip="Editar" />
            <Button icon="pi pi-trash" rounded severity="danger" onClick={() => confirmDeleteCombustible(row)} tooltip="Eliminar" />
        </div>
    );

    const leftToolbarTemplate = () => (
        <div className="my-2 flex gap-2">
            <Button label="Nuevo" icon="pi pi-plus" severity="info" onClick={openNew} />
            <Button label="Eliminar" icon="pi pi-trash" severity="danger" onClick={confirmDeleteSelected} disabled={!selectedCombustibles.length} />
        </div>
    );

    const rightToolbarTemplate = () => <Button label="Exportar" icon="pi pi-upload" severity="help" onClick={exportCSV} />;

    const header = (
        <div className="flex flex-column md:flex-row md:justify-content-between md:align-items-center">
            <h5 className="m-0">Gestión de Combustible</h5>
            <span className="block mt-2 md:mt-0 p-input-icon-left">
                <i className="pi pi-search" />
                <InputText type="search" onInput={(e) => setFilters({ ...filters, global: { value: e.currentTarget.value, matchMode: 'contains' } })} placeholder="Buscar..." />
            </span>
        </div>
    );

    const combustibleDialogFooter = (
        <>
            <Button label="Cancelar" icon="pi pi-times" text onClick={hideDialog} />
            <Button label="Guardar" icon="pi pi-check" text onClick={saveCombustible} />
        </>
    );

    const unidadOptions = combustible.tipo_equipo === 'camion'
        ? camiones.map(c => ({ label: `${c.nombre} (${c.placa})`, value: c.id }))
        : maquinarias.map(m => ({ label: `${m.eco} - ${m.equipo}`, value: m.id }));

    return (
        <div className="grid crud-demo">
            <div className="col-12 lg:col-6 xl:col-3">
                <div className="card mb-0">
                    <div className="flex justify-content-between mb-3">
                        <div>
                            <span className="block text-500 font-medium mb-3">Total de Importe de Combustible</span>
                            <div className="text-900 font-medium text-xl">{totalImporte.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</div>
                        </div>
                        <div className="flex align-items-center justify-content-center bg-green-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                            <i className="pi pi-dollar text-green-500 text-xl" />
                        </div>
                    </div>
                    <span className="text-500">Total histórico</span>
                </div>
            </div>
            <div className="col-12 lg:col-6 xl:col-3">
                <div className="card mb-0">
                    <div className="flex justify-content-between mb-3">
                        <div>
                            <span className="block text-500 font-medium mb-3">Litros gastados en {nombreMes}</span>
                            <div className="text-900 font-medium text-xl">{litrosDelMes} L</div>
                        </div>
                        <div className="flex align-items-center justify-content-center bg-blue-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                            <i className="pi pi-truck text-blue-500 text-xl" />
                        </div>
                    </div>
                    <span className="text-500">Total de litros consumidos este mes</span>
                </div>
            </div>
            <div className="col-12 lg:col-6 xl:col-3">
                <div className="card mb-0">
                    <div className="flex justify-content-between mb-3">
                        <div>
                            <span className="block text-500 font-medium mb-3">Operador con más litros</span>
                            <div className="text-900 font-medium text-xl">{operadorTop ? `${(operadorTop as any).operador} (${(operadorTop as any).litros} L)` : 'N/A'}</div>
                        </div>
                        <div className="flex align-items-center justify-content-center bg-orange-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                            <i className="pi pi-user text-orange-500 text-xl" />
                        </div>
                    </div>
                    <span className="text-500">Mayor consumo este mes</span>
                </div>
            </div>

            <div className="col-12">
                <div className="card">
                    <Toast ref={toast} />
                    <Toolbar className="mb-4" left={leftToolbarTemplate} right={rightToolbarTemplate} />

                    <div className="flex flex-wrap gap-2 mb-4">
                        <Calendar
                            value={filtroFechas as any}
                            onChange={(e) => setFiltroFechas((e.value as Date[]) || null)}
                            selectionMode="range"
                            placeholder="Filtrar por fecha (desde - hasta)"
                            dateFormat="yy-mm-dd"
                            showIcon
                            showButtonBar
                            className="w-full sm:w-auto"
                        />
                        <Dropdown
                            value={filtroUnidad}
                            options={unidadOptionsFiltro}
                            onChange={(e) => setFiltroUnidad(e.value)}
                            placeholder="Filtrar por unidad"
                            showClear
                            filter
                            className="w-full sm:w-auto"
                        />
                        <Dropdown
                            value={filtroOperador}
                            options={operadores.map((o) => ({ label: o.nombre, value: o.id }))}
                            onChange={(e) => setFiltroOperador(e.value)}
                            placeholder="Filtrar por operador"
                            showClear
                            filter
                            className="w-full sm:w-auto"
                        />
                    </div>

                    <DataTable
                        ref={dt}
                        value={combustiblesFiltrados}
                        selection={selectedCombustibles}
                        onSelectionChange={(e) => setSelectedCombustibles(e.value || [])}
                        dataKey="id"
                        paginator
                        rows={10}
                        rowsPerPageOptions={[5, 10, 25]}
                        loading={loading}
                        filters={filters}
                        filterDisplay="menu"
                        emptyMessage="No se encontraron registros de combustible"
                        header={header}
                        sortField="fecha"
                        sortOrder={-1}
                        responsiveLayout="scroll"
                    >
                        <Column selectionMode="multiple" headerStyle={{ width: '3rem' }} exportable={false} />
                        <Column field="fecha" header="Fecha" sortable style={{ width: '110px' }} />
                        <Column header="Tipo" body={tipoBodyTemplate} style={{ width: '120px' }} />
                        <Column header="Unidad" body={unidadBodyTemplate} style={{ minWidth: '180px' }} />
                        <Column field="operador_nombre" header="Operador" sortable style={{ width: '160px' }} />
                        <Column header="Km / Horómetro" body={kmHorometroBodyTemplate} style={{ width: '140px' }} />
                        <Column field="precio_unitario" header="Precio/L" body={(r: Combustible) => (r.precio_unitario != null ? r.precio_unitario.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '-')} style={{ width: '110px' }} />
                        <Column field="litros" header="Litros" sortable style={{ width: '90px' }} />
                        <Column field="importe" header="Importe" body={importeBodyTemplate} sortable style={{ width: '120px' }} />
                        <Column header="Acciones" body={actionBodyTemplate} style={{ width: '120px' }} exportable={false} />
                    </DataTable>

                    <Dialog visible={combustibleDialog} style={{ width: '550px' }} header="Registro de Combustible" modal className="p-fluid" footer={combustibleDialogFooter} onHide={hideDialog}>
                        <div className="field">
                            <label htmlFor="fecha">Fecha <span style={{ color: 'red' }}>*</span></label>
                            <Calendar
                                id="fecha"
                                value={combustible.fecha ? (() => { const [y, m, d] = combustible.fecha.split('-').map(Number); return new Date(y, m - 1, d); })() : null}
                                onChange={(e) => setCombustible({ ...combustible, fecha: e.value ? `${e.value.getFullYear()}-${String(e.value.getMonth() + 1).padStart(2, '0')}-${String(e.value.getDate()).padStart(2, '0')}` : '' })}
                                dateFormat="yy-mm-dd"
                                showIcon
                                className={submitted && !combustible.fecha ? 'p-invalid' : ''}
                            />
                            {submitted && !combustible.fecha && <small className="p-error">Requerido</small>}
                        </div>

                        <div className="grid">
                            <div className="col-6">
                                <div className="field">
                                    <label htmlFor="tipo_equipo">Tipo <span style={{ color: 'red' }}>*</span></label>
                                    <Dropdown
                                        id="tipo_equipo"
                                        value={combustible.tipo_equipo}
                                        options={tipoOptions}
                                        onChange={(e) => cambiarTipo(e.value)}
                                        placeholder="Camión o Maquinaria"
                                        className={submitted && !combustible.tipo_equipo ? 'p-invalid' : ''}
                                    />
                                    {submitted && !combustible.tipo_equipo && <small className="p-error">Requerido</small>}
                                </div>
                            </div>
                            <div className="col-6">
                                <div className="field">
                                    <label htmlFor="unidad">Unidad <span style={{ color: 'red' }}>*</span></label>
                                    <Dropdown
                                        id="unidad"
                                        value={combustible.tipo_equipo === 'camion' ? combustible.camion_id : combustible.maquinaria_id}
                                        options={unidadOptions}
                                        onChange={(e) => setCombustible(combustible.tipo_equipo === 'camion' ? { ...combustible, camion_id: e.value } : { ...combustible, maquinaria_id: e.value })}
                                        placeholder={combustible.tipo_equipo ? 'Selecciona la unidad' : 'Elige un tipo primero'}
                                        disabled={!combustible.tipo_equipo}
                                        filter
                                        className={submitted && combustible.tipo_equipo && !(combustible.tipo_equipo === 'camion' ? combustible.camion_id : combustible.maquinaria_id) ? 'p-invalid' : ''}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="field">
                            <label htmlFor="id_operador">Operador <span style={{ color: 'red' }}>*</span></label>
                            <Dropdown
                                id="id_operador"
                                value={combustible.id_operador}
                                options={operadores.map(o => ({ label: o.nombre, value: o.id }))}
                                onChange={(e) => setCombustible({ ...combustible, id_operador: e.value })}
                                placeholder="Selecciona un operador"
                                filter
                                className={submitted && !combustible.id_operador ? 'p-invalid' : ''}
                            />
                            {submitted && !combustible.id_operador && <small className="p-error">Requerido</small>}
                        </div>

                        <div className="grid">
                            <div className="col-6">
                                <div className="field">
                                    <label htmlFor="kilometraje">Kilometraje</label>
                                    <InputNumber
                                        id="kilometraje"
                                        value={combustible.kilometraje ?? null}
                                        onValueChange={(e) => setCombustible({ ...combustible, kilometraje: e.value ?? null })}
                                        min={0}
                                        disabled={combustible.tipo_equipo !== 'camion'}
                                        placeholder="Solo camiones"
                                    />
                                </div>
                            </div>
                            <div className="col-6">
                                <div className="field">
                                    <label htmlFor="horometro">Horómetro</label>
                                    <InputNumber
                                        id="horometro"
                                        value={combustible.horometro ?? null}
                                        onValueChange={(e) => setCombustible({ ...combustible, horometro: e.value ?? null })}
                                        min={0}
                                        disabled={combustible.tipo_equipo !== 'maquinaria'}
                                        placeholder="Solo maquinaria"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid">
                            <div className="col-6">
                                <div className="field">
                                    <label htmlFor="precio_unitario">Precio por Litro <span style={{ color: 'red' }}>*</span></label>
                                    <InputNumber
                                        id="precio_unitario"
                                        value={combustible.precio_unitario ?? null}
                                        onValueChange={(e) => {
                                            const precio = e.value ?? null;
                                            setCombustible({ ...combustible, precio_unitario: precio, importe: precio != null && combustible.litros != null ? Math.round(precio * combustible.litros * 100) / 100 : combustible.importe });
                                        }}
                                        mode="currency"
                                        currency="MXN"
                                        locale="es-MX"
                                        min={0}
                                        className={submitted && !combustible.precio_unitario ? 'p-invalid' : ''}
                                    />
                                    {submitted && !combustible.precio_unitario && <small className="p-error">Requerido</small>}
                                </div>
                            </div>
                            <div className="col-6">
                                <div className="field">
                                    <label htmlFor="litros">Litros <span style={{ color: 'red' }}>*</span></label>
                                    <InputLitros
                                        id="litros"
                                        value={combustible.litros ?? null}
                                        onChange={(litros) => {
                                            setCombustible({ ...combustible, litros, importe: litros != null && combustible.precio_unitario != null ? Math.round(combustible.precio_unitario * litros * 100) / 100 : combustible.importe });
                                        }}
                                        className={submitted && !combustible.litros ? 'p-invalid' : ''}
                                    />
                                    {submitted && !combustible.litros && <small className="p-error">Requerido</small>}
                                </div>
                            </div>
                        </div>

                        <div className="field">
                            <label>Importe (calculado)</label>
                            <div className="p-inputtext" style={{ fontWeight: 'bold', background: 'var(--surface-100)' }}>
                                {(combustible.importe || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                            </div>
                        </div>

                        <div className="field">
                            <label>Evidencia fotográfica</label>
                            <div className="grid">
                                {[
                                    { label: 'Antes de cargar', url: combustible.foto_indicador_antes_url },
                                    { label: 'Bomba', url: combustible.foto_bomba_url },
                                    { label: 'Después de cargar', url: combustible.foto_indicador_despues_url }
                                ].map((foto) => (
                                    <div key={foto.label} className="col-4">
                                        <div className="text-500 text-sm mb-1">{foto.label}</div>
                                        {foto.url ? <img src={foto.url} alt={foto.label} className="w-full border-round" /> : <div className="text-sm text-500">Sin foto</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Dialog>

                    <CombustibleWizardDialog
                        visible={wizardDialog}
                        onHide={() => setWizardDialog(false)}
                        onGuardado={cargar}
                        camiones={camiones}
                        maquinarias={maquinarias}
                        operadores={operadores}
                    />

                    <CombustibleVistaSidebar combustible={vistaCombustible} onHide={() => setVistaCombustible(null)} />

                    <Dialog visible={deleteCombustibleDialog} style={{ width: '450px' }} header="Confirmar Eliminación" modal onHide={() => setDeleteCombustibleDialog(false)} footer={
                        <>
                            <Button label="No" icon="pi pi-times" text onClick={() => setDeleteCombustibleDialog(false)} />
                            <Button label="Sí" icon="pi pi-check" text onClick={deleteCombustibleConfirmado} />
                        </>
                    }>
                        <div className="flex align-items-center justify-content-center">
                            <i className="pi pi-exclamation-triangle mr-3" style={{ fontSize: '2rem', color: '#f44336' }} />
                            <span>¿Eliminar este registro de combustible?</span>
                        </div>
                    </Dialog>

                    <Dialog visible={deleteCombustiblesDialog} style={{ width: '450px' }} header="Confirmar Eliminación Múltiple" modal onHide={() => setDeleteCombustiblesDialog(false)} footer={
                        <>
                            <Button label="No" icon="pi pi-times" text onClick={() => setDeleteCombustiblesDialog(false)} />
                            <Button label="Sí" icon="pi pi-check" text onClick={deleteSelectedCombustibles} />
                        </>
                    }>
                        <div className="flex align-items-center justify-content-center">
                            <i className="pi pi-exclamation-triangle mr-3" style={{ fontSize: '2rem', color: '#f44336' }} />
                            <span>¿Eliminar {selectedCombustibles.length} registro(s)?</span>
                        </div>
                    </Dialog>
                </div>
            </div>
        </div>
    );
};

export default CombustiblePage;
