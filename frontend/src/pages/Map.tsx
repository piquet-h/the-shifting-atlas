import React from 'react'
import WorldMap from '../components/WorldMap'

/**
 * Map page – full-viewport world graph visualisation.
 * Accessible at /map.
 */
export default function Map(): React.ReactElement {
    return (
        <div className="h-full flex flex-col" aria-labelledby="map-page-title">
            <h1 id="map-page-title" tabIndex={-1} className="sr-only">
                The Shifting Atlas – World Map
            </h1>
            <WorldMap />
        </div>
    )
}
