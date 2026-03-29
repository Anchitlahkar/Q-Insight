import { create } from "zustand";
import { SimulationResult } from "@/lib/types";

interface VisualizationState {
  currentStep: number;
  visualizationResult: SimulationResult | null;
  isVisualizing: boolean;
  isPlaying: boolean;
  speedMs: number;
}

interface VisualizationActions {
  setCurrentStep: (step: number) => void;
  setVisualizationResult: (result: SimulationResult | null) => void;
  setIsVisualizing: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  setSpeedMs: (value: number) => void;
  resetVisualization: () => void;
}

const initialState: VisualizationState = {
  currentStep: -1,
  visualizationResult: null,
  isVisualizing: false,
  isPlaying: false,
  speedMs: 600,
};

export const useVisualizationStore = create<VisualizationState & VisualizationActions>((set) => ({
  ...initialState,
  setCurrentStep: (step) => set({ currentStep: step }),
  setVisualizationResult: (result) => set({ visualizationResult: result }),
  setIsVisualizing: (value) => set({ isVisualizing: value }),
  setIsPlaying: (value) => set({ isPlaying: value }),
  setSpeedMs: (value) => set({ speedMs: value }),
  resetVisualization: () => set({ ...initialState }),
}));
