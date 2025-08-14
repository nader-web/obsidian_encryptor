// detect.ts
import { BEGIN_MARKER, END_MARKER } from './constants';

export interface BlockRange {
  beginIdx: number;
  endIdx: number;
  block: string;
}

/**
 * Finds the nearest encrypted block based on cursor position.
 */
export function getBlockRange(text: string, from: number, to: number): BlockRange | null {
  const cursor = Math.max(from, to);
  
  // Find all blocks in the text
  const blocks: Array<{start: number, end: number}> = [];
  let startPos = 0;
  
  while (true) {
    const beginIdx = text.indexOf(BEGIN_MARKER, startPos);
    if (beginIdx === -1) break;
    
    const endIdx = text.indexOf(END_MARKER, beginIdx + BEGIN_MARKER.length);
    if (endIdx === -1) break;
    
    const blockEndPos = endIdx + END_MARKER.length;
    blocks.push({
      start: beginIdx,
      end: blockEndPos
    });
    
    startPos = blockEndPos;
  }
  
  // Find the block that contains or is closest to the cursor
  for (const block of blocks) {
    if (cursor >= block.start && cursor <= block.end) {
      return {
        beginIdx: block.start,
        endIdx: block.end,
        block: text.substring(block.start, block.end)
      };
    }
  }
  
  // If no block contains the cursor, find the nearest block
  if (blocks.length > 0) {
    // Sort blocks by distance to cursor
    const sortedBlocks = [...blocks].sort((a, b) => {
      const distA = Math.min(
        Math.abs(cursor - a.start),
        Math.abs(cursor - a.end)
      );
      const distB = Math.min(
        Math.abs(cursor - b.start),
        Math.abs(cursor - b.end)
      );
      return distA - distB;
    });
    
    const nearestBlock = sortedBlocks[0];
    return {
      beginIdx: nearestBlock.start,
      endIdx: nearestBlock.end,
      block: text.substring(nearestBlock.start, nearestBlock.end)
    };
  }
  
  return null;
}
