'use client';

import React from 'react';
import AgendaCrud from '../pages/crud/Agenda/AgendaCrud';

const AgendaPage = () => {
    return (
        <div className="grid crud-demo">
            <div className="col-12">
                <AgendaCrud />
            </div>
        </div>
    );
};

export default AgendaPage;
