import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../components/ui/dialog";
import { QuestionMarkCircledIcon } from "@radix-ui/react-icons";

export function Help() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <button className="text-slate-400 hover:text-slate-600">
                    <QuestionMarkCircledIcon className="w-5 h-5" />
                </button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Keyboard Shortcuts</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                    <div className="grid grid-cols-2 items-center gap-4">
                        <div className="text-sm font-medium">Space</div>
                        <div className="text-sm text-slate-600">Play/Pause audio</div>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-4">
                        <div className="text-sm font-medium">←/→</div>
                        <div className="text-sm text-slate-600">Previous/Next utterance</div>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-4">
                        <div className="text-sm font-medium">↑/↓</div>
                        <div className="text-sm text-slate-600">Adjust playback speed</div>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-4">
                        <div className="text-sm font-medium">Enter</div>
                        <div className="text-sm text-slate-600">Edit current utterance</div>
                    </div>
                    <div className="grid grid-cols-2 items-center gap-4">
                        <div className="text-sm font-medium">Escape</div>
                        <div className="text-sm text-slate-600">Cancel editing</div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
} 