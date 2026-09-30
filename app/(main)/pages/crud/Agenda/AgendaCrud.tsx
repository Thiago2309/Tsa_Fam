'use client';

import React, { useRef } from 'react';
import { TabView, TabPanel } from 'primereact/tabview';
import { Toast } from 'primereact/toast';
import { getUserIdFromLocalStorage, getUserRoleIdFromLocalStorage } from '../../../../../Services/BD/userService';
import AgendaCalendario from './AgendaCalendario';
import AgendaKanban from './AgendaKanban';

const ROLEID_ADMIN = 1;

const AgendaCrud = () => {
    const toast = useRef<Toast>(null);
    const userId = getUserIdFromLocalStorage();
    const esAdmin = getUserRoleIdFromLocalStorage() === ROLEID_ADMIN;

    if (!userId) {
        return (
            <div className="card">
                <p>No se pudo identificar tu usuario. Vuelve a iniciar sesión.</p>
            </div>
        );
    }

    return (
        <div className="agenda-modulo">
            <Toast ref={toast} />
            <div className="card agenda-card">
                <div className="agenda-header">
                    <h4>
                        <i className="pi pi-calendar" /> Mi Agenda
                    </h4>
                    <p>Organiza tus reuniones, conferencias y llamadas, y da seguimiento a tus tareas.</p>
                </div>
                <TabView>
                    <TabPanel header="Calendario" leftIcon="pi pi-calendar-plus mr-2">
                        <AgendaCalendario userId={userId} esAdmin={esAdmin} toast={toast} />
                    </TabPanel>
                    <TabPanel header="Tareas (Kanban)" leftIcon="pi pi-table mr-2">
                        <AgendaKanban userId={userId} toast={toast} />
                    </TabPanel>
                </TabView>
            </div>
        </div>
    );
};

export default AgendaCrud;
