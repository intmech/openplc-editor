import { Checkbox } from '@root/renderer/components/_atoms/checkbox'
import type { ScannedDeviceMatch } from '@root/types/ethercat/esi-types'
import { cn } from '@root/utils'
import { getBestMatchQuality } from '@root/utils/ethercat/device-matcher'

type DiscoveredDeviceTableProps = {
  deviceMatches: ScannedDeviceMatch[]
  selectedDevices: Set<number>
  onSelectDevice: (position: number, selected: boolean) => void
  onSelectAll: (selected: boolean) => void
  isScanning: boolean
}

/**
 * Discovered Device Table Component
 *
 * Displays scanned EtherCAT devices with match indicators and selection checkboxes.
 */
const DiscoveredDeviceTable = ({
  deviceMatches,
  selectedDevices,
  onSelectDevice,
  onSelectAll,
  isScanning,
}: DiscoveredDeviceTableProps) => {
  // Calculate selection state
  const selectableDevices = deviceMatches.filter((dm) => getBestMatchQuality(dm.matches) !== 'none')
  const allSelected =
    selectableDevices.length > 0 && selectableDevices.every((dm) => selectedDevices.has(dm.device.position))
  const someSelected = selectableDevices.some((dm) => selectedDevices.has(dm.device.position))

  const handleSelectAll = () => {
    onSelectAll(!allSelected)
  }

  return (
    <div className='flex-1 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-800'>
      <table className='w-full table-fixed'>
        <thead className='sticky top-0 bg-neutral-100 dark:bg-neutral-900'>
          <tr>
            <th className='w-[40px] px-2 py-2'>
              <Checkbox
                checked={someSelected && !allSelected ? 'indeterminate' : allSelected}
                onCheckedChange={handleSelectAll}
                disabled={selectableDevices.length === 0}
              />
            </th>
            <th className='w-[8%] px-2 py-2 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300'>
              Pos
            </th>
            <th className='w-[20%] px-2 py-2 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300'>
              Name
            </th>
            <th className='w-[12%] px-2 py-2 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300'>
              Vendor
            </th>
            <th className='w-[14%] px-2 py-2 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300'>
              Product
            </th>
            <th className='px-2 py-2 text-left text-xs font-medium text-neutral-700 dark:text-neutral-300'>I/O</th>
          </tr>
        </thead>
        <tbody>
          {deviceMatches.length === 0 ? (
            <tr>
              <td colSpan={6} className='px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400'>
                {isScanning
                  ? 'Scanning for devices...'
                  : 'No devices found. Click "Scan" to discover EtherCAT devices on the network.'}
              </td>
            </tr>
          ) : (
            deviceMatches.map((dm) => {
              const bestQuality = getBestMatchQuality(dm.matches)
              const isSelectable = bestQuality !== 'none'
              const isSelected = selectedDevices.has(dm.device.position)

              return (
                <tr
                  key={dm.device.position}
                  onClick={() => isSelectable && onSelectDevice(dm.device.position, !isSelected)}
                  className={cn(
                    'border-b border-neutral-200 transition-colors dark:border-neutral-800',
                    isSelectable && 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
                    isSelected && 'bg-brand/10 dark:bg-brand/20',
                    !isSelectable && 'opacity-60',
                  )}
                >
                  <td className='px-2 py-2'>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => onSelectDevice(dm.device.position, !!checked)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={!isSelectable}
                    />
                  </td>
                  <td className='px-2 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300'>
                    {dm.device.position}
                  </td>
                  <td
                    className='truncate px-2 py-2 text-sm font-medium text-neutral-950 dark:text-neutral-100'
                    title={dm.device.name}
                  >
                    {dm.device.name}
                  </td>
                  <td className='px-2 py-2 font-mono text-xs text-neutral-600 dark:text-neutral-400'>
                    0x{dm.device.vendor_id.toString(16).padStart(4, '0').toUpperCase()}
                  </td>
                  <td className='px-2 py-2 font-mono text-xs text-neutral-600 dark:text-neutral-400'>
                    0x{dm.device.product_code.toString(16).padStart(8, '0').toUpperCase()}
                  </td>
                  <td className='px-2 py-2 text-xs text-neutral-600 dark:text-neutral-400'>
                    {dm.device.input_bytes}B / {dm.device.output_bytes}B
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

export { DiscoveredDeviceTable }
