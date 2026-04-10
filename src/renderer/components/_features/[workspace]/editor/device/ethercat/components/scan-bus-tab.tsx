import { ArrowIcon, MinusIcon, PlusIcon } from '@root/renderer/assets/icons'
import TableActions from '@root/renderer/components/_atoms/table-actions'
import type { EtherCATDevice, NetworkInterface } from '@root/types/ethercat'
import type {
  ConfiguredEtherCATDevice,
  ESIDeviceRef,
  ESIDeviceSummary,
  ESIRepositoryItemLight,
  ScannedDeviceMatch,
} from '@root/types/ethercat/esi-types'
import { cn } from '@root/utils'
import { useState } from 'react'

import { DeviceBrowserModal } from './device-browser-modal'
import { DiscoveredDeviceTable } from './discovered-device-table'
import { InterfaceSelector } from './interface-selector'

type ScanBusTabProps = {
  isConnectedToRuntime: boolean
  // Service status
  serviceAvailable: boolean | null
  serviceMessage: string
  // Network interfaces
  interfaces: NetworkInterface[]
  selectedInterface: string
  onSelectInterface: (value: string) => void
  isLoadingInterfaces: boolean
  interfaceError: string | null
  onRefreshInterfaces: () => void
  // Scan
  isScanning: boolean
  scanError: string | null
  scanTimeMs: number | null
  scanMessage: string
  scannedDevices: EtherCATDevice[]
  onScan: () => void
  // Match results
  deviceMatches: ScannedDeviceMatch[]
  matchCounts: { total: number; exact: number; partial: number; none: number }
  // Selection
  selectedScannedDevices: Set<number>
  onSelectScannedDevice: (position: number, selected: boolean) => void
  onSelectAllScanned: (selected: boolean) => void
  onAddSelectedFromScan: () => void
  // Configured devices & manual add/remove
  configuredDevices: ConfiguredEtherCATDevice[]
  repository: ESIRepositoryItemLight[]
  onAddDeviceFromBrowser: (ref: ESIDeviceRef, device: ESIDeviceSummary, repoItem: ESIRepositoryItemLight) => void
  onRemoveDevice: (deviceId: string) => void
}

const ScanBusTab = ({
  isConnectedToRuntime,
  serviceAvailable,
  serviceMessage,
  interfaces,
  selectedInterface,
  onSelectInterface,
  isLoadingInterfaces,
  interfaceError,
  onRefreshInterfaces,
  isScanning,
  scanError,
  scanTimeMs,
  scanMessage,
  onScan,
  deviceMatches,
  matchCounts,
  selectedScannedDevices,
  onSelectScannedDevice,
  onSelectAllScanned,
  onAddSelectedFromScan,
  configuredDevices,
  repository,
  onAddDeviceFromBrowser,
  onRemoveDevice,
}: ScanBusTabProps) => {
  const [isDeviceBrowserOpen, setIsDeviceBrowserOpen] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)

  return (
    <div className='flex flex-1 flex-col gap-4 overflow-hidden'>
      {/* Service not available state */}
      {isConnectedToRuntime && serviceAvailable === false && (
        <div className='mb-4 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 dark:border-yellow-700 dark:bg-yellow-900/20'>
          <p className='text-sm font-medium text-yellow-700 dark:text-yellow-300'>
            EtherCAT Discovery Service Not Available
          </p>
          <p className='mt-1 max-w-md text-xs text-yellow-600 dark:text-yellow-400'>{serviceMessage}</p>
        </div>
      )}

      {/* Interface Selection and Scan Controls */}
      <div className='flex flex-1 flex-col overflow-hidden'>
        <div className='mb-4 flex flex-wrap items-end gap-4'>
          <InterfaceSelector
            interfaces={interfaces}
            selectedInterface={selectedInterface}
            onSelectInterface={onSelectInterface}
            isLoading={isLoadingInterfaces}
            error={interfaceError}
            onRefresh={onRefreshInterfaces}
          />

          <button
            onClick={onScan}
            disabled={isScanning || !selectedInterface || !isConnectedToRuntime || serviceAvailable === false}
            className={cn(
              'flex h-[30px] items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors',
              'bg-brand text-white hover:bg-brand-medium-dark',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {isScanning ? (
              <>
                <ArrowIcon size='sm' className='animate-spin stroke-white' />
                Scanning...
              </>
            ) : (
              'Scan'
            )}
          </button>

          {scanTimeMs !== null && (
            <span className='text-xs text-neutral-500 dark:text-neutral-400'>
              Completed in {scanTimeMs}ms{scanMessage ? ` — ${scanMessage}` : ''}
            </span>
          )}
        </div>

        {/* Error/Status Messages */}
        {scanError && (
          <div className='mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-800 dark:bg-red-900/20'>
            <p className='text-sm text-red-700 dark:text-red-300'>{scanError}</p>
          </div>
        )}

        {/* Match summary */}
        {deviceMatches.length > 0 && (
          <div className='mb-4 flex items-center justify-between'>
            <div className='flex items-center gap-4'>
              <span className='text-sm text-neutral-700 dark:text-neutral-300'>
                Found {matchCounts.total} device(s):
              </span>
              <span className='text-xs text-green-600 dark:text-green-400'>{matchCounts.exact} exact</span>
              <span className='text-xs text-yellow-600 dark:text-yellow-400'>{matchCounts.partial} partial</span>
              <span className='text-xs text-red-600 dark:text-red-400'>{matchCounts.none} no match</span>
            </div>
            {selectedScannedDevices.size > 0 && (
              <button
                onClick={onAddSelectedFromScan}
                className='rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-medium-dark'
              >
                Add Selected ({selectedScannedDevices.size})
              </button>
            )}
          </div>
        )}

        {/* Discovered Devices Table */}
        <DiscoveredDeviceTable
          deviceMatches={deviceMatches}
          selectedDevices={selectedScannedDevices}
          onSelectDevice={onSelectScannedDevice}
          onSelectAll={onSelectAllScanned}
          isScanning={isScanning}
        />

        {/* Configured Devices header with +/- actions */}
        <div className='mb-2 mt-4 flex items-center justify-between'>
          <h3 className='text-sm font-medium text-neutral-950 dark:text-neutral-100'>
            Configured Devices
            {configuredDevices.length > 0 && (
              <span className='ml-1 font-normal text-neutral-500'>({configuredDevices.length})</span>
            )}
          </h3>
          <TableActions
            actions={[
              {
                ariaLabel: 'Add Device',
                onClick: () => setIsDeviceBrowserOpen(true),
                icon: <PlusIcon className='h-4 w-4 stroke-brand' />,
                id: 'add-ethercat-device-button',
              },
              {
                ariaLabel: 'Remove Device',
                onClick: () => {
                  if (selectedDeviceId) {
                    onRemoveDevice(selectedDeviceId)
                    setSelectedDeviceId(null)
                  }
                },
                disabled: !selectedDeviceId,
                icon: <MinusIcon className='h-4 w-4 stroke-brand' />,
                id: 'remove-ethercat-device-button',
              },
            ]}
            buttonProps={{
              className:
                'rounded-md p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed',
            }}
          />
        </div>

        {/* Configured Devices list */}
        <div className='flex-1 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-800'>
          {configuredDevices.length === 0 ? (
            <div className='flex h-full items-center justify-center p-4'>
              <p className='text-center text-xs text-neutral-500 dark:text-neutral-400'>
                No devices configured. Click + to add a device from the repository.
              </p>
            </div>
          ) : (
            configuredDevices.map((device) => {
              const repoItem = repository.find((r) => r.id === device.esiDeviceRef.repositoryItemId)
              const esiDevice = repoItem?.devices[device.esiDeviceRef.deviceIndex]
              const isActive = device.id === selectedDeviceId

              return (
                <button
                  key={device.id}
                  onClick={() => setSelectedDeviceId(device.id === selectedDeviceId ? null : device.id)}
                  className={cn(
                    'flex w-full items-center gap-3 border-b border-neutral-100 px-3 py-2 text-left transition-colors dark:border-neutral-800',
                    isActive ? 'bg-brand/10 dark:bg-brand/20' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
                  )}
                >
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-2'>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          isActive
                            ? 'text-brand-medium dark:text-brand-light'
                            : 'text-neutral-950 dark:text-neutral-100',
                        )}
                      >
                        {device.name}
                      </span>
                      <span
                        className={cn(
                          'inline-block rounded px-1 py-0.5 text-[10px] font-medium',
                          device.addedFrom === 'scan'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                        )}
                      >
                        {device.addedFrom === 'scan' ? 'Scan' : 'Manual'}
                      </span>
                    </div>
                    <span className='text-[10px] text-neutral-500 dark:text-neutral-400'>
                      {esiDevice?.name || 'Unknown type'}
                    </span>
                  </div>
                  <span className='text-[10px] text-neutral-400 dark:text-neutral-500'>
                    Pos: {device.position ?? '-'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Device Browser Modal */}
      <DeviceBrowserModal
        isOpen={isDeviceBrowserOpen}
        onClose={() => setIsDeviceBrowserOpen(false)}
        onSelectDevice={onAddDeviceFromBrowser}
        repository={repository}
      />
    </div>
  )
}

export { ScanBusTab }
