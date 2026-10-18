'use client';
import React, { useRef } from 'react';
import { Image } from 'primereact/image';
import { Button } from 'primereact/button';

interface FotoZoomProps {
    src: string;
    alt: string;
}

// Foto con visor a pantalla completa (zoom +/-, rotar y descargar). Se abre tocando la foto o con el botón "Ver en grande".
const FotoZoom = ({ src, alt }: FotoZoomProps) => {
    const imageRef = useRef<Image>(null);

    return (
        <div className="flex flex-column gap-1">
            <Image ref={imageRef} src={src} alt={alt} preview downloadable className="block w-full" imageClassName="w-full border-round" />
            <Button type="button" label="Ver en grande" icon="pi pi-search-plus" size="small" text className="w-full p-1" onClick={() => imageRef.current?.show()} />
        </div>
    );
};

export default FotoZoom;
